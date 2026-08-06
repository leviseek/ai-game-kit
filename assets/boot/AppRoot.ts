import { _decorator, Component, director } from "cc";
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
  type UiPage,
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
import {
  createFairyGuiPageAdapter,
  createFairyGuiView,
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
  private uiScope?: ResourceScope;
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
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("smoke") === "fairygui-ui") {
        setTimeout(() => {
          this.runUiSmoke().catch((error) => {
            console.error("[ui-smoke] sequence error", error);
          });
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
    // 经资源作用域驱动（见 4.x 编排约定）
    this.pageAdapter = createFairyGuiPageAdapter({
      root,
      provider: this.resourceProvider,
      createView: createFairyGuiView,
    });
    this.pageAdapter.init();
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

    // 4. 遮罩呈现/移除（模态输入阻断）
    this.smokeUiSetModal(true);
    report("modal-show", true);
    this.smokeUiSetModal(false);
    report("modal-hide", true);

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

  /** 冒烟触发：消费导航模态状态呈现/移除遮罩。 */
  smokeUiSetModal(modal: boolean): void {
    this.pageAdapter?.setModal(modal);
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

  onDestroy(): void {
    this.adapter?.unbind();
    this.sceneFlow?.dispose();
    this.pageAdapter?.dispose();
    this.resourceProvider?.dispose();
    this.app?.dispose().catch(() => {
      // dispose 失败已由 Application 内部通过 context.logger 记录
    });
  }
}
