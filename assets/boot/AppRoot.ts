import {
  _decorator,
  Component,
  director,
  EventTouch,
  Node,
  Touch,
  Vec3,
  profiler,
} from "cc";
import {
  Application,
  createSceneFlow,
  createServiceRegistry,
  createServiceToken,
  type IResourceProvider,
  type Logger,
  type Module,
  type ResourceHandle,
  type ResourceScope,
  type SceneFlow,
  type SceneResources,
  type SceneSwitchResult,
  ServiceResolutionError,
  type ServiceRegistry,
  type ServiceToken,
  type TimeSource,
  type UiLayer,
  type UiNavigator,
  type UiPage,
  createUiNavigator,
} from "../framework";
import { createApplicationContext } from "../framework/application/ApplicationContext";
import { WallClock } from "../framework/core/time/WallClock";
import { ConsoleLogger } from "../framework/diagnostics/logging/ConsoleLogger";
import { CocosApplicationAdapter } from "../framework/adapters/cocos/application/CocosApplicationAdapter";
import { createCocosResourceProvider } from "../framework/adapters/cocos/resource/CocosResourceProvider";
import { createCocosSceneAdapter } from "../framework/adapters/cocos/scene/CocosSceneAdapter";
import {
  createCocosUiRoot,
  type CocosUiRoot,
} from "../framework/adapters/cocos/ui/CocosUiRoot";
import { runFixtureSmoke } from "../game/fixture/smoke";
import { runFixturePerf, type PerfSample } from "../game/fixture/perf";
import {
  createFairyGuiPageAdapter,
  createFairyGuiView,
  createClickableFairyGuiView,
  type FairyGuiPageAdapter,
  type FairyGuiPageHandle,
} from "../framework/adapters/cocos/ui/FairyGuiPageAdapter";

const { ccclass } = _decorator;

export function createModules(): readonly Module[] {
  return [];
}

// 装配前 token 校验：对组合根声明的必需服务逐一 resolve。缺失 token 或解析期
// 依赖循环抛 ServiceResolutionError（继承 FrameworkError），使非法装配在
// Application.start 前失败、不进入 running。
function validateRequiredTokens(
  registry: ServiceRegistry,
  requiredTokens: readonly ServiceToken<unknown>[],
): void {
  for (const token of requiredTokens) {
    registry.resolve(token);
  }
}

export interface AppAssembly {
  readonly app: Application;
  readonly adapter: CocosApplicationAdapter;
  readonly sceneFlow: SceneFlow;
  /** 冒烟用资源提供者：供释放观察（canUnload）查询。 */
  readonly resourceProvider: IResourceProvider;
  /** UI 根宿主：封装 FairyGUI GRoot 获取与运行时初始化时机。 */
  readonly uiRoot: CocosUiRoot;
  /** 组合根日志：供 UI 根初始化失败上报等场景使用。 */
  readonly logger: Logger;
  /** 组合根显式创建的服务注册表：供装配前 token 校验与业务对象经构造注入服务契约。 */
  readonly registry: ServiceRegistry;
  /** 装配前 token 校验：缺失/循环在此同步抛错，失败走既有 app.start().catch 路径。 */
  readonly validateAssembly: () => void;
}

export function assembleApp(): AppAssembly {
  const logger = new ConsoleLogger();
  const context = createApplicationContext(logger);
  const modules = createModules();
  const app = new Application(modules, context);
  const adapter = new CocosApplicationAdapter(app);

  // 服务注册表由组合根显式创建；注册一个无副作用的墙钟时间源作为最小接入演示，
  // 后续业务服务在此以类型化 token 注册。注册表不进 Context、不做全局单例。
  const registry = createServiceRegistry();
  const appTimeSourceToken = createServiceToken<TimeSource>("app.time");
  registry.register(appTimeSourceToken, new WallClock());

  // 装配前 token 校验：模块声明依赖的 token 在此逐个 resolve（缺失/循环同步抛错）。
  // 闭包在 AppRoot.start 先于 app.start 调用，失败走既有 app.start().catch 失败路径。
  const validateAssembly = (): void => {
    validateRequiredTokens(registry, [appTimeSourceToken]);
  };

  // 场景流转冒烟组合：真实引擎接缝（cc.assetManager / cc.director）的整链路
  // 组装点。场景名与资源的映射属于游戏层组合，这里只提供最小组装与触发入口；
  // 编排行为已由 Bun 测试（scene-flow / cocos-resource-provider / cocos-scene-adapter）兜底。
  const resourceProvider = createCocosResourceProvider();
  const sceneFlow = createSceneFlow({
    provider: resourceProvider,
    activateScene: createCocosSceneAdapter().activateScene,
    onProgress: (sceneId, progress) => {
      logger.info(`[smoke] scene "${sceneId}" progress: ${progress}`);
    },
    onError: (error) => {
      logger.error(
        "[smoke] scene flow error",
        undefined,
        error instanceof Error ? error : undefined,
      );
    },
  });

  // UI 根宿主经 Adapter 工厂接入：fgui 类型不进入组合根，初始化时机由
  // AppRoot.start 在引擎 ready 后触发。
  const uiRoot = createCocosUiRoot();

  return {
    app,
    adapter,
    sceneFlow,
    resourceProvider,
    uiRoot,
    logger,
    registry,
    validateAssembly,
  };
}

@ccclass("AppRoot")
export class AppRoot extends Component {
  private app?: Application;
  private adapter?: CocosApplicationAdapter;
  private sceneFlow?: SceneFlow;
  private resourceProvider?: IResourceProvider;
  private uiRoot?: CocosUiRoot;
  private pageAdapter?: FairyGuiPageAdapter;
  private navigator?: UiNavigator;
  private uiScope?: ResourceScope;
  private resizeUnsubscribe?: () => void;
  private logger?: Logger;
  private validateAssembly?: () => void;

  onLoad(): void {
    const {
      app,
      adapter,
      sceneFlow,
      resourceProvider,
      uiRoot,
      logger,
      validateAssembly,
    } = assembleApp();
    this.app = app;
    this.adapter = adapter;
    this.sceneFlow = sceneFlow;
    this.resourceProvider = resourceProvider;
    this.uiRoot = uiRoot;
    this.logger = logger;
    this.validateAssembly = validateAssembly;
    director.addPersistRootNode(this.node);
  }

  start(): void {
    // 装配前 token 校验先于 adapter.bind/initializeUiRoot：校验失败时不留
    // 已绑定/已初始化的全局状态，应用保持 created 不进入 running。
    const launch = async (): Promise<void> => {
      // 缺失/循环在此抛 ServiceResolutionError，与启动失败共用下方既有
      // app.start().catch 失败路径。
      this.validateAssembly?.();
      this.adapter?.bind();
      this.initializeUiRoot();
      await this.app?.start();
    };
    launch().catch((error) => {
      if (error instanceof ServiceResolutionError) {
        // 装配前校验失败发生在 Application.start 之前，未经 Application 上报，
        // 由组合根经 logger 记录类型化错误。
        this.logger?.error("Service assembly validation failed", undefined, error);
      } else {
        // 非装配校验错误（如 ApplicationStateError）Application 内部不记录，
        // 由组合根记录避免静默吞错；模块生命周期失败仍由 Application 记录。
        this.logger?.error(
          "AppRoot launch aborted",
          undefined,
          error instanceof Error ? error : undefined,
        );
      }
    });

    // 冒烟驱动：URL 带 smoke=fairygui-ui 时延迟到引擎 ready 后执行完整序列。
    // 延迟用 setTimeout 让 GRoot 在首帧后可用（spike 已验证此窗口），
    // 仅在浏览器环境生效；纯 TS 测试不触发。
    // 优先级：smoke=fairygui-ui > smoke=scene-flow > smoke=modal-click > fixture=<品类>，
    // else-if 互斥保证一次请求只跑一种冒烟序列，不会叠加执行。
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("smoke") === "fairygui-ui") {
        setTimeout(() => {
          this.runUiSmoke().catch((error) => {
            console.error("[ui-smoke] sequence error", error);
          });
        }, 1000);
      } else if (params.get("smoke") === "scene-flow") {
        setTimeout(() => {
          this.runSceneFlowSmoke().catch((error) => {
            console.error("[scene-smoke] sequence error", error);
          });
        }, 1000);
      } else if (params.get("smoke") === "modal-click") {
        setTimeout(() => {
          this.runModalClickSmoke().catch((error) => {
            console.error("[modal-click] sequence error", error);
          });
        }, 1000);
      } else if (params.get("fixture") !== null) {
        // 按品类夹具冒烟：组合逻辑留在游戏层夹具登记表，AppRoot 只做薄转发
        const fixtureId = params.get("fixture") ?? "";
        setTimeout(() => {
          runFixtureSmoke(fixtureId).catch((error) => {
            console.error("[fixture-smoke] sequence error", error);
          });
        }, 1000);
      } else if (params.get("fixture-perf") !== null) {
        // 品类夹具基础性能检查：经 Cocos Profiler 采样引擎运行状态。
        // 采样器由组合根（唯一允许依赖 cc 的装配层）读取 profiler.stats，
        // 游戏层 runFixturePerf 保持引擎无关，只消费纯数值采样。
        const perfFixtureId = params.get("fixture-perf") ?? "";
        setTimeout(() => {
          runFixturePerf(perfFixtureId, () => this.sampleProfilerStats()).catch(
            (error) => {
              console.error("[fixture-perf] sequence error", error);
            },
          );
        }, 1000);
      }
    }
  }

  /**
   * 引擎 ready 后初始化 UI 根宿主。GRoot 未就绪时 init 抛错，此处仅上报
   * 且保持未初始化；当前不自动重试，init 幂等可由后续显式调用再次触发。
   */
  private initializeUiRoot(): void {
    if (this.uiRoot === undefined) {
      return;
    }
    try {
      this.uiRoot.init();
    } catch (error) {
      // GRoot 尚未就绪：上报而不静默吞掉，保持未初始化
      this.logger?.error(
        "[ui] FairyGUI UI root initialization failed",
        undefined,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * 按需建立页面适配器：uiRoot 初始化成功且尚未创建时创建，并建立七层
   * GRoot 容器。GRoot 未就绪时返回 false，调用方可重试（对齐 init 幂等语义）。
   */
  private ensurePageAdapter(): boolean {
    if (this.uiRoot === undefined || this.resourceProvider === undefined) {
      return false;
    }
    if (this.pageAdapter !== undefined) {
      return true;
    }
    const root = this.uiRoot.root;
    if (root === undefined) {
      return false;
    }
    // 页面创建经 fgui 包注册表（createFairyGuiView 位于 Adapter 边界），
    // 组合根不直接 import fgui；provider 为预留参数，逆序释放由冒烟方法
    // 经资源作用域驱动（见 4.x 编排约定）。导航器经适配器消费模态状态，
    // 阻断自动呈现遮罩，组合根不再手动调用 setModal
    if (this.navigator === undefined) {
      this.navigator = createUiNavigator();
    }
    this.pageAdapter = createFairyGuiPageAdapter({
      root,
      provider: this.resourceProvider,
      navigator: this.navigator,
      createView: createFairyGuiView,
    });
    this.pageAdapter.init();
    // 窗口尺寸变化 → UI 根同步 root 布局后通知适配器同步层级容器，无需手动刷新
    this.resizeUnsubscribe?.();
    this.resizeUnsubscribe = this.uiRoot.onResize((width, height) => {
      this.pageAdapter?.resize(width, height);
    });
    return true;
  }

  /** 冒烟触发：后台预加载目标场景资源，不切换当前场景。 */
  smokePreload(sceneId: string, resources: SceneResources): Promise<void> {
    return this.sceneFlow?.preload(sceneId, resources) ?? Promise.resolve();
  }

  /** 冒烟触发：完整场景切换（预加载 → 激活 → 所有权转移）。 */
  smokeSwitchTo(
    sceneId: string,
    resources: SceneResources,
  ): Promise<SceneSwitchResult> {
    return (
      this.sceneFlow?.switchTo(sceneId, resources) ??
      Promise.resolve({ ok: false, sceneId, reason: "scene flow not assembled" })
    );
  }

  /** 冒烟观察：查询 Bundle 是否已无作用域持有（可卸载）。 */
  smokeCanUnload(bundle: string): boolean {
    return this.resourceProvider?.canUnload(bundle) ?? false;
  }

  /**
   * 冒烟触发：初始化 UI 根宿主与页面适配器。返回是否就绪；GRoot 未就绪时
   * 返回 false 且保持未初始化，供冒烟驱动在引擎 ready 后重试。
   */
  smokeUiInit(): boolean {
    this.initializeUiRoot();
    return this.ensurePageAdapter();
  }

  /** 冒烟触发：加载 FairyGUI package 并登记到资源作用域，返回加载结果标识。 */
  smokeUiLoadPackage(bundle: string, path: string): Promise<ResourceHandle> {
    const provider = this.resourceProvider;
    if (provider === undefined) {
      const key = { kind: "fairygui-package" as const, bundle, path };
      const error = new Error("resource provider not assembled");
      const handle = {
        key,
        state: "failed" as const,
        resource: undefined,
        error,
        done: Promise.resolve(),
        cancel: () => {},
      } as unknown as ResourceHandle;
      return Promise.resolve(handle);
    }
    if (this.uiScope === undefined) {
      this.uiScope = provider.createScope();
    }
    const handle = provider.loadPackage<{ readonly name: string }>(bundle, path);
    this.uiScope.retain(handle);
    return handle.done;
  }

  /** 冒烟触发：释放 UI 冒烟作用域，触发 package → Bundle 逆序释放。 */
  smokeUiRelease(): void {
    if (this.uiScope === undefined) {
      return;
    }
    this.uiScope.release();
    this.uiScope = undefined;
  }

  /**
   * 冒烟触发：运行场景流转冒烟序列（引擎集成冒烟驱动）。覆盖预加载、
   * 成功切换、失败保留当前场景、重试与资源释放闭环。每步经 console 输出
   * `[scene-smoke]` 标记，由 headless Chrome + CDP 采集验证（对齐 runUiSmoke）。
   * 构建产物已含 `game` 场景（main Bundle 已注册），单向冒烟 startup → game
   * 安全；回切 startup 会实例化第二个 AppRoot，本序列只做单向。
   */
  async runSceneFlowSmoke(): Promise<void> {
    const report = (step: string, ok: boolean, detail = "") => {
      console.log(
        `[scene-smoke] ${step}: ${ok ? "ok" : "FAIL"}${detail ? ` (${detail})` : ""}`,
      );
    };

    // 1. 入口：初始场景 startup，ui Bundle 尚无持有（可卸载）
    const initialScene = director.getScene()?.name ?? "";
    report("entry", initialScene === "startup", initialScene);
    report("initial-can-unload-ui", this.smokeCanUnload("ui"));

    // 2. 预加载：ui 被流转作用域持有（不可卸载）
    let preloadHolds = false;
    try {
      await this.smokePreload("game", { bundle: "ui", paths: ["placeholder"] });
      preloadHolds = !this.smokeCanUnload("ui");
      report("preload", true);
      report("preload-holds-ui", preloadHolds);
    } catch (error) {
      report("preload", false, error instanceof Error ? error.message : String(error));
      return;
    }

    // 3. 释放闭环：对第二个目标（common）预加载触发前一次流转作用域释放 →
    //    ui 归零可卸载，common 被新流转作用域持有。
    let releaseLoop = false;
    try {
      await this.smokePreload("game", {
        bundle: "common",
        paths: ["placeholder"],
      });
      releaseLoop = this.smokeCanUnload("ui");
      report("release-loop", releaseLoop);
    } catch (error) {
      report("release-loop", false, error instanceof Error ? error.message : String(error));
      return;
    }

    // 4. 成功切换：启动 game 场景，ui 所有权转移给 sceneScope（仍不可卸载）
    let switched = false;
    try {
      const result = await this.smokeSwitchTo("game", {
        bundle: "ui",
        paths: ["placeholder"],
      });
      switched = result.ok === true && result.sceneId === "game";
      report("switch", switched, String(result.reason ?? ""));
      report(
        "switch-scene",
        director.getScene()?.name === "game",
        director.getScene()?.name ?? "",
      );
      report("switch-holds-ui", !this.smokeCanUnload("ui"));
    } catch (error) {
      report("switch", false, error instanceof Error ? error.message : String(error));
    }

    // 5. 资源链失败：不存在的 Bundle 加载失败，场景保留 game、可重试
    let failKeeps = false;
    try {
      const result = await this.smokeSwitchTo("game", {
        bundle: "no-such-bundle",
        paths: ["placeholder"],
      });
      failKeeps = result.ok === false;
      report("fail-keeps-scene", failKeeps, String(result.reason ?? ""));
    } catch (error) {
      report("fail-keeps-scene", false, error instanceof Error ? error.message : String(error));
    }

    // 6. 失败后重试：切回正常资源再次成功
    let retried = false;
    try {
      const result = await this.smokeSwitchTo("game", {
        bundle: "ui",
        paths: ["placeholder"],
      });
      retried = result.ok === true && result.sceneId === "game";
      report("retry", retried, String(result.reason ?? ""));
    } catch (error) {
      report("retry", false, error instanceof Error ? error.message : String(error));
    }

    // 7. 未加载 Bundle 卸载 no-op：canUnload 查询不崩溃且为 true
    report("missing-bundle-noop", this.smokeCanUnload("no-such-bundle"));

    console.log("[scene-smoke] complete");
  }

  /**
   * 冒烟触发：运行 FairyGUI UI 冒烟序列（引擎集成冒烟驱动）。覆盖 UI 根
   * 初始化、package 加载、页面打开/关闭、遮罩呈现/移除、资源释放闭环与
   * 未加载 package 失败保留标识。每步经 console 输出 `[ui-smoke]` 标记，
   * 由 headless Chrome + CDP 采集验证；任何异常经 onError 上报后继续。
   */
  async runUiSmoke(): Promise<void> {
    const report = (step: string, ok: boolean, detail = "") => {
      console.log(`[ui-smoke] ${step}: ${ok ? "ok" : "FAIL"}${detail ? ` (${detail})` : ""}`);
    };

    // 1. UI 根与页面适配器初始化
    const ready = this.smokeUiInit();
    report("ui-root-init", ready);
    if (!ready) {
      return;
    }

    // 2. 加载 Demo package（assets/ui/Demo/Demo.bin → bundle "ui" 路径 "Demo/Demo"）
    let packageLoaded = false;
    try {
      const handle = await this.smokeUiLoadPackage("ui", "Demo/Demo");
      packageLoaded = handle.state === "ready";
      report("package-load", packageLoaded, String(handle.state));
    } catch (error) {
      report("package-load", false, error instanceof Error ? error.message : String(error));
    }

    // 3. 打开页面（package 加载成功后才创建视图）
    const opened = packageLoaded
      ? this.smokeUiOpenPage("demo", "normal", "Demo", "DemoView")
      : false;
    report("page-open", opened);

    // 4. 遮罩呈现/移除（模态输入阻断）：经导航器打开/关闭阻断页面，遮罩由
    //    适配器消费导航模态状态自动同步，组合根不再手动调用 setModal
    let modalShown = false;
    let modalHidden = false;
    if (this.navigator !== undefined) {
      const openResult = this.navigator.open("ui-modal", {
        layer: "popup",
        blocking: true,
      });
      modalShown = openResult.ok === true && this.navigator.modal === true;
      const closeResult = this.navigator.close();
      modalHidden = closeResult.ok === true && this.navigator.modal === false;
    }
    report("modal-show", modalShown);
    report("modal-hide", modalHidden);

    // 5. 关闭页面
    const closed = this.smokeUiClosePage("demo");
    report("page-close", closed);

    // 6. 资源释放闭环：释放作用域后 ui Bundle 应可卸载
    this.smokeUiRelease();
    const canUnload = this.smokeCanUnload("ui");
    report("resource-release", canUnload);

    // 7. 未加载 package：不存在的路径应保留失败标识（no-op 不崩溃）
    let noopFailed = true;
    try {
      const handle = await this.smokeUiLoadPackage("ui", "NoSuchPackage/NoSuchView");
      noopFailed = handle.state === "failed";
      report("missing-package-noop", noopFailed, String(handle.state));
    } catch (error) {
      report("missing-package-noop", noopFailed, error instanceof Error ? error.message : String(error));
    }
    this.smokeUiRelease();

    console.log("[ui-smoke] complete");
  }

  /**
   * 冒烟触发：运行模态遮罩真实交互点击验证序列（引擎集成冒烟驱动）。挂载
   * 全屏可点击下层页面到 normal 层，经导航器进入阻断模态自动呈现遮罩，暴露
   * CDP 交互钩子；headless Chrome 驱动下注入触摸到 GRoot 根节点，经 fgui
   * 真实命中逻辑断言模态期间遮罩拦截（点击不穿透下层）、解除后下层恢复。
   * 每步经 console 输出 `[modal-click]` 标记。
   */
  async runModalClickSmoke(): Promise<void> {
    const report = (step: string, ok: boolean, detail = "") => {
      console.log(`[modal-click] ${step}: ${ok ? "ok" : "FAIL"}${detail ? ` (${detail})` : ""}`);
    };

    // 1. UI 根与页面适配器初始化
    const ready = this.smokeUiInit();
    report("ui-root-init", ready);
    if (!ready) {
      return;
    }

    // 2. 加载 Demo package（复用资源作用域，验证 package 加载路径不受影响）
    let packageLoaded = false;
    try {
      const handle = await this.smokeUiLoadPackage("ui", "Demo/Demo");
      packageLoaded = handle.state === "ready";
      report("package-load", packageLoaded, String(handle.state));
    } catch (error) {
      report("package-load", false, error instanceof Error ? error.message : String(error));
    }

    // 3. 挂载全屏可点击下层页面到 normal 层：遮罩在 system 层更上，命中优先
    //    遮罩，下层页面在模态期间收不到点击
    const root = this.uiRoot?.root;
    const width = root?.width ?? 1280;
    const height = root?.height ?? 720;
    const container = this.pageAdapter?.containerFor("normal");
    let underHits = 0;
    if (container === undefined) {
      report("under-mounted", false, "normal layer container not ready");
      return;
    }
    // 冒烟一次性下层视图：直接挂 normal 层容器，不进 adapter pages 登记
    // （无 route 管理需求），随容器在 AppRoot 销毁时一并释放
    const under = createClickableFairyGuiView(() => {
      underHits += 1;
      console.log(`[modal-click] under-hit (${underHits})`);
    }, width, height);
    container.addChild(under);
    report("under-mounted", true);

    // 4. 进入阻断模态：遮罩由导航器状态自动呈现
    const opened = this.navigator?.open("modal-click-under", {
      layer: "system",
      blocking: true,
    });
    report("modal-active", opened?.ok === true && this.navigator?.modal === true);

    // 5. 暴露 CDP 交互钩子：轮询模态状态、解除模态、读取下层命中数、注入触摸。
    //    tap 与 hitIsUnder 均取 GRoot 中心（rootSize 坐标系），坐标由钩子内部
    //    计算，避免调用方猜测屏幕/设计分辨率映射
    if (typeof window !== "undefined") {
      const center = (): { x: number; y: number } => ({
        x: Math.round((this.uiRoot?.root?.width ?? 0) / 2),
        y: Math.round((this.uiRoot?.root?.height ?? 0) / 2),
      });
      (window as unknown as Record<string, unknown>).__modalClick = {
        active: () => this.navigator?.modal === true,
        clear: () => this.navigator?.close(),
        underHits: () => underHits,
        // 点击是否命中下层页面：与 fgui InputProcessor 相同坐标转换
        // （screenToWorld + rootSize 高度翻转）后命中测试，等价"点击不穿透"
        hitIsUnder: () => {
          const grNode = (this.uiRoot?.root as unknown as {
            node?: Node;
          }).node;
          const rootG = this.uiRoot?.root as unknown as {
            height?: number;
            hitTest?: (ax: number, ay: number, forTouch?: boolean) => unknown;
          };
          const c = center();
          if (grNode === undefined) {
            return false;
          }
          let hit: unknown;
          const camera = director.root?.batcher2D?.getFirstRenderCamera?.(grNode);
          if (camera !== undefined && camera !== null) {
            const world = new Vec3();
            camera.screenToWorld(world, new Vec3(c.x, c.y, 0));
            hit = rootG.hitTest?.(world.x, (rootG.height ?? 960) - world.y, true);
          } else {
            hit = rootG.hitTest?.(c.x, c.y, true);
          }
          return hit === under;
        },
        // 应用内触摸注入：向 GRoot.node 派发 cc 触摸流（TOUCH_START + TOUCH_END），
        // 经 fgui InputProcessor 真实命中/遮罩拦截逻辑处理。返回是否注入成功。
        tap: () => {
          const grNode = (this.uiRoot?.root as unknown as {
            node?: Node;
          }).node;
          if (grNode === undefined) {
            return false;
          }
          const c = center();
          const touch = new Touch(c.x, c.y);
          const all = [touch];
          grNode.emit(
            Node.EventType.TOUCH_START,
            new EventTouch([touch], false, Node.EventType.TOUCH_START, all),
          );
          grNode.emit(
            Node.EventType.TOUCH_END,
            new EventTouch([touch], false, Node.EventType.TOUCH_END, all),
          );
          return true;
        },
      };
    }
    console.log("[modal-click] ready");
  }

  /**
   * 冒烟触发：打开页面。pageAdapter 未就绪时返回 false；页面创建失败保留
   * 诊断（读取 page.error）。挂载后返回 true。
   */
  smokeUiOpenPage(
    route: string,
    layer: UiLayer,
    packageName: string,
    resName: string,
  ): boolean {
    if (!this.ensurePageAdapter() || this.pageAdapter === undefined) {
      return false;
    }
    const page = this.pageAdapter.createPage(route, layer, {
      packageName,
      resName,
    });
    if (page.disposed) {
      return false;
    }
    this.pageAdapter.mount(page);
    return true;
  }

  /** 冒烟触发：关闭页面（先卸载挂载再销毁 View）。返回是否关闭。 */
  smokeUiClosePage(route: string): boolean {
    if (this.pageAdapter === undefined) {
      return false;
    }
    const page = this.pageAdapter.findPage(route);
    if (page === undefined) {
      return false;
    }
    this.pageAdapter.destroy(page);
    return true;
  }

  /** 冒烟观察：页面适配器是否已就绪（GRoot 已初始化）。 */
  smokeUiReady(): boolean {
    return this.pageAdapter !== undefined && this.uiRoot?.initialized === true;
  }

  /**
   * 性能采样器：读取 Cocos Profiler 当前帧的引擎运行状态。stats 未就绪时
   * 返回 null（由游戏层 runFixturePerf 跳过本次采样）。每项为引擎计时器或
   * 渲染统计的实时值；纹理/缓冲区内存单位为 MB。
   */
  private sampleProfilerStats(): PerfSample | null {
    const stats = profiler.stats;
    if (stats === null) {
      return null;
    }
    return {
      fps: stats.fps.counter.value,
      frameMs: stats.frame.counter.value,
      logicMs: stats.logic.counter.value,
      draws: stats.draws.counter.value,
      textureMemoryMB: stats.textureMemory.counter.value,
      bufferMemoryMB: stats.bufferMemory.counter.value,
    };
  }

  onDestroy(): void {
    this.resizeUnsubscribe?.();
    this.resizeUnsubscribe = undefined;
    // 清理冒烟交互钩子：闭包持有本组件，常驻根销毁时一并释放
    if (typeof window !== "undefined") {
      delete (window as unknown as Record<string, unknown>).__modalClick;
    }
    this.adapter?.unbind();
    this.sceneFlow?.dispose();
    this.pageAdapter?.dispose();
    // 适配器 dispose 已恢复导航器原始方法，再释放导航器本身（组合根创建的
    // 生命周期随组合根收尾）
    this.navigator?.dispose();
    this.navigator = undefined;
    this.resourceProvider?.dispose();
    this.app?.dispose().catch(() => {
      // dispose 失败已由 Application 内部通过 context.logger 记录
    });
  }
}
