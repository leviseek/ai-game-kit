import { _decorator, Component, game } from "cc";
import {
  Application,
  createSceneFlow,
  type IResourceProvider,
  type Logger,
  type Module,
  type SceneFlow,
  type SceneResources,
  type SceneSwitchResult,
} from "../framework";
import { createApplicationContext } from "../framework/application/ApplicationContext";
import { ConsoleLogger } from "../framework/diagnostics/logging/ConsoleLogger";
import { CocosApplicationAdapter } from "../framework/adapters/cocos/application/CocosApplicationAdapter";
import { createCocosResourceProvider } from "../framework/adapters/cocos/resource/CocosResourceProvider";
import { createCocosSceneAdapter } from "../framework/adapters/cocos/scene/CocosSceneAdapter";
import {
  createCocosUiRoot,
  type CocosUiRoot,
} from "../framework/adapters/cocos/ui/CocosUiRoot";

const { ccclass } = _decorator;

export function createModules(): readonly Module[] {
  return [];
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
}

export function assembleApp(): AppAssembly {
  const logger = new ConsoleLogger();
  const context = createApplicationContext(logger);
  const modules = createModules();
  const app = new Application(modules, context);
  const adapter = new CocosApplicationAdapter(app);

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

  return { app, adapter, sceneFlow, resourceProvider, uiRoot, logger };
}

@ccclass("AppRoot")
export class AppRoot extends Component {
  private app?: Application;
  private adapter?: CocosApplicationAdapter;
  private sceneFlow?: SceneFlow;
  private resourceProvider?: IResourceProvider;
  private uiRoot?: CocosUiRoot;
  private logger?: Logger;

  onLoad(): void {
    const { app, adapter, sceneFlow, resourceProvider, uiRoot, logger } =
      assembleApp();
    this.app = app;
    this.adapter = adapter;
    this.sceneFlow = sceneFlow;
    this.resourceProvider = resourceProvider;
    this.uiRoot = uiRoot;
    this.logger = logger;
    game.addPersistRootNode(this.node);
  }

  start(): void {
    this.adapter?.bind();
    this.initializeUiRoot();
    this.app?.start().catch(() => {
      // 启动失败已由 Application 内部通过 context.logger 记录
    });
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

  onDestroy(): void {
    this.adapter?.unbind();
    this.sceneFlow?.dispose();
    this.resourceProvider?.dispose();
    this.app?.dispose().catch(() => {
      // dispose 失败已由 Application 内部通过 context.logger 记录
    });
  }
}
