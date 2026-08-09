import type {
    IResourceProvider,
    ResourceHandle,
    SceneFlow,
    SceneResources,
    SceneSwitchResult,
    UiLayer,
} from "../../framework";
import { runFixtureSmoke } from "../../game/fixture/smoke";
import type { GameLobbyHostImpl } from "../host/GameLobbyHostImpl";
import type { UiHost } from "../host/UiHost";
import {
    createSmokeRouter,
    type SmokeRouter,
} from "../flow/SmokeRouter";
import { runUiSmoke } from "./ui-smoke";
import { runSceneFlowSmoke } from "./scene-smoke";
import {
    clearModalClickHook,
    runModalClickSmoke,
} from "./modal-click";
import { runCardBattleSmoke } from "./card-battle";
import { runFixturePerfSmoke } from "./perf";

/**
 * 冒烟代理依赖：由组合根把已装配的宿主（UiHost/GameLobbyHostImpl）与引擎接缝
 * （sceneFlow/resourceProvider）注入。组合根只保留一个冒烟初始化入口
 * （createSmokeProxy），BootFlow 经 smoke.router 消费同一 SmokeRouter 实例。
 */
export interface SmokeProxyDeps {
    readonly uiHost: UiHost;
    readonly sceneFlow: SceneFlow;
    readonly resourceProvider: IResourceProvider;
    readonly lobbyHost: GameLobbyHostImpl;
}

/**
 * 冒烟代理：把 AppRoot 的冒烟触发/观察方法与 URL 冒烟分派收敛为单一入口。
 * 组合根仅经 createSmokeProxy 初始化，内部再创建 SmokeRouter 供 BootFlow 消费；
 * 页面打开/关闭、场景切换与资源释放观察均委托对应宿主。dispose 清理冒烟
 * 交互钩子（闭包持有组件与宿主），常驻根销毁时一并释放。
 */
export class SmokeProxy {
    private readonly uiHost: UiHost;
    private readonly sceneFlow: SceneFlow;
    private readonly resourceProvider: IResourceProvider;
    private readonly lobbyHost: GameLobbyHostImpl;
    private readonly smokeRouter: SmokeRouter;

    constructor(deps: SmokeProxyDeps) {
        this.uiHost = deps.uiHost;
        this.sceneFlow = deps.sceneFlow;
        this.resourceProvider = deps.resourceProvider;
        this.lobbyHost = deps.lobbyHost;
        this.smokeRouter = createSmokeRouter({
            runUiSmoke: () => this.runUiSmoke(),
            runSceneFlowSmoke: () => this.runSceneFlowSmoke(),
            runModalClickSmoke: () => this.runModalClickSmoke(),
            runCardBattleSmoke: () => this.runCardBattleSmoke(),
            runFixtureSmoke: (fixtureId) => this.runFixtureSmoke(fixtureId),
            runFixturePerf: (perfFixtureId) => this.runFixturePerf(perfFixtureId),
        });
    }

    /** URL 冒烟分派器：由 BootFlow 消费，默认流程与冒烟分叉共用。 */
    get router(): SmokeRouter {
        return this.smokeRouter;
    }

    /** 场景冒烟触发：预加载目标场景资源（经 sceneFlow）。 */
    smokePreload(sceneId: string, resources: SceneResources): Promise<void> {
        return this.sceneFlow.preload(sceneId, resources);
    }

    /** 场景冒烟触发：切换到目标场景（经 sceneFlow）。 */
    smokeSwitchTo(
        sceneId: string,
        resources: SceneResources,
    ): Promise<SceneSwitchResult> {
        return this.sceneFlow.switchTo(sceneId, resources);
    }

    /** 场景冒烟观察：查询 Bundle 是否已无作用域持有（可卸载）。 */
    smokeCanUnload(bundle: string): boolean {
        return this.resourceProvider.canUnload(bundle);
    }

    /** UI 冒烟触发：初始化 UI 根宿主与页面适配器。返回是否就绪。 */
    smokeUiInit(): boolean {
        return this.uiHost.smokeUiInit();
    }

    /** UI 冒烟观察：页面适配器是否已就绪（GRoot 已初始化）。 */
    smokeUiReady(): boolean {
        return this.uiHost.smokeUiReady();
    }

    /** UI 冒烟触发：加载 FairyGUI package 并登记到全局常驻 uiScope。 */
    smokeUiLoadPackage(bundle: string, path: string): Promise<ResourceHandle> {
        return this.uiHost.loadPackage(bundle, path);
    }

    /** UI 冒烟触发：打开页面。pageAdapter 未就绪时返回 false。 */
    smokeUiOpenPage(
        route: string,
        layer: UiLayer,
        packageName: string,
        resName: string,
    ): boolean {
        return this.uiHost.openPage(route, layer, packageName, resName);
    }

    /** UI 冒烟触发：关闭页面（先卸载挂载再销毁 View）。返回是否关闭。 */
    smokeUiClosePage(route: string): boolean {
        return this.uiHost.closePage(route);
    }

    /** FairyGUI UI 冒烟序列。 */
    runUiSmoke(): Promise<void> {
        return runUiSmoke(this.uiHost);
    }

    /** 场景流转冒烟序列。 */
    runSceneFlowSmoke(): Promise<void> {
        return runSceneFlowSmoke({
            preload: (sceneId, resources) => this.sceneFlow.preload(sceneId, resources),
            switchTo: (sceneId, resources) => this.sceneFlow.switchTo(sceneId, resources),
            canUnload: (bundle) => this.resourceProvider.canUnload(bundle),
        });
    }

    /** 模态遮罩真实交互点击冒烟序列。 */
    runModalClickSmoke(): Promise<void> {
        return runModalClickSmoke(this.uiHost);
    }

    /** 卡牌对战真实可玩冒烟序列；先确保共享 UI 依赖（Common）已注册。 */
    runCardBattleSmoke(): Promise<void> {
        return runCardBattleSmoke(this.uiHost, () => this.lobbyHost.ensureSharedUiDependencies());
    }

    /** 游戏层品类夹具冒烟序列。 */
    runFixtureSmoke(fixtureId: string): Promise<void> {
        return runFixtureSmoke(fixtureId);
    }

    /** 品类夹具性能检查序列（注入 Cocos Profiler 采样器）。 */
    runFixturePerf(perfFixtureId: string): Promise<void> {
        return runFixturePerfSmoke(perfFixtureId);
    }

    /** 释放：清理冒烟交互钩子（闭包持有组件与宿主）。幂等。 */
    dispose(): void {
        clearModalClickHook();
    }
}

export function createSmokeProxy(deps: SmokeProxyDeps): SmokeProxy {
    return new SmokeProxy(deps);
}
