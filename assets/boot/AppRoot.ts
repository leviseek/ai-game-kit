import { _decorator, Component, game } from "cc";
import { Application } from "../framework";
import type { Module } from "../framework";
import { createApplicationContext } from "../framework/application/ApplicationContext";
import { ConsoleLogger } from "../framework/diagnostics/logging/ConsoleLogger";
import { CocosApplicationAdapter } from "../framework/adapters/cocos/application/CocosApplicationAdapter";
import {
  createSceneFlow,
  type SceneFlow,
  type SceneResources,
  type SceneSwitchResult,
} from "../framework/core/scene/SceneFlow";
import type { IResourceProvider } from "../framework/contracts/resource/ResourceProvider";
import { createCocosResourceProvider } from "../framework/adapters/cocos/resource/CocosResourceProvider";
import { createCocosSceneAdapter } from "../framework/adapters/cocos/scene/CocosSceneAdapter";

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

  return { app, adapter, sceneFlow, resourceProvider };
}

@ccclass("AppRoot")
export class AppRoot extends Component {
  private app?: Application;
  private adapter?: CocosApplicationAdapter;
  private sceneFlow?: SceneFlow;
  private resourceProvider?: IResourceProvider;

  onLoad(): void {
    const { app, adapter, sceneFlow, resourceProvider } = assembleApp();
    this.app = app;
    this.adapter = adapter;
    this.sceneFlow = sceneFlow;
    this.resourceProvider = resourceProvider;
    game.addPersistRootNode(this.node);
  }

  start(): void {
    this.adapter?.bind();
    this.app?.start().catch(() => {
      // 启动失败已由 Application 内部通过 context.logger 记录
    });
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
    this.app?.dispose().catch(() => {
      // dispose 失败已由 Application 内部通过 context.logger 记录
    });
  }
}
