import {
    lookupBundle,
    type IResourceProvider,
    type ResourceHandle,
    type SceneFlow,
    type SceneResources,
    type SceneSwitchResult,
    type UiLayer,
} from "../../framework";
import { profiler } from "cc";
import { createFairyGuiViewHandle } from "../../framework/adapters/cocos/ui/FairyGuiViewHandle";
import { createDynamicComponentViewHandle } from "../../framework/adapters/cocos/ui/DynamicComponentViewHandle";
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
import type { PerfSample } from "../../game/fixture/perf";

/** game bundle 冒烟模块的结构性子集（经全局注册桥读取，运行时经 lookupBundle）。 */
interface GameSmokeModule {
    readonly smokes?: {
        readonly fixture: (fixtureId: string) => Promise<void>;
        readonly perf: (fixtureId: string, sample: () => PerfSample | null) => Promise<void>;
    };
}

/** samples bundle 冒烟模块的结构性子集（cardBattle/autoBattle 宿主为 boot 侧 UiHost 结构）。 */
interface SamplesSmokeModule {
    readonly smokes?: {
        readonly cardBattle: (
            host: unknown,
            ensureSharedDependencies: () => Promise<void>,
            options?: { readonly nodeResolver?: (view: unknown) => (name: string) => unknown },
        ) => Promise<void>;
        readonly autoBattle: (
            host: unknown,
            ensureSharedDependencies: () => Promise<void>,
            options?: {
                readonly nodeResolver?: (view: unknown) => (name: string) => unknown;
                readonly scale?: number;
            },
        ) => Promise<void>;
    };
}

/**
 * 性能采样器：读取 Cocos Profiler 当前帧的引擎运行状态。stats 未就绪时
 * 返回 null（由游戏层 runFixturePerf 跳过本次采样）。每项为引擎计时器或
 * 渲染统计的实时值；纹理/缓冲区内存单位为 MB。采样器是唯一允许依赖 cc 的
 * 装配层职责，游戏层 runner 保持引擎无关。
 */
function sampleProfilerStats(): PerfSample | null {
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
 * 页面打开/关闭、场景切换与资源释放观察均委托对应宿主。依赖 game/samples 的
 * 冒烟（fixture/perf/card-battle）经全局注册桥动态加载执行，boot 不再静态
 * import game 代码。dispose 清理冒烟交互钩子（闭包持有组件与宿主），常驻根
 * 销毁时一并释放。
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
            runAutoBattleSmoke: () => this.runAutoBattleSmoke(),
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

    /** 加载 game bundle 使游戏模块注册就绪（bundle 内任一资源加载触发整包脚本执行）。 */
    private async loadGameBundle(): Promise<void> {
        const handle = this.resourceProvider.load("game", "game");
        await handle.done;
    }

    /** 加载 samples bundle 使样本模块注册就绪。 */
    private async loadSamplesBundle(): Promise<void> {
        const handle = this.resourceProvider.load("samples", "placeholder");
        await handle.done;
    }

    /** 卡牌对战真实可玩冒烟序列；先确保共享 UI 依赖（Common）已注册。 */
    async runCardBattleSmoke(): Promise<void> {
        await this.loadSamplesBundle();
        const samplesModule = lookupBundle("samples") as SamplesSmokeModule | undefined;
        const smoke = samplesModule?.smokes?.cardBattle;
        if (smoke === undefined) {
            throw new Error(`[smoke] samples module has no cardBattle smoke`);
        }
        await smoke(
            this.uiHost,
            () => this.lobbyHost.ensureSharedUiDependencies(),
            // 注入真实 fgui 渲染接缝：把 CardBattleView 根组件包装成节点解析器，
            // 冒烟渲染落到真实页面节点，验证 CardBattleView.xml 与 viewModel 节点名对齐
            {
                nodeResolver: (view) => createFairyGuiViewHandle(view as never),
            },
        );
    }

    /** 自动战斗真实可玩冒烟序列；先确保共享 UI 依赖（Common）已注册。 */
    async runAutoBattleSmoke(): Promise<void> {
        await this.loadSamplesBundle();
        const samplesModule = lookupBundle("samples") as SamplesSmokeModule | undefined;
        const smoke = samplesModule?.smokes?.autoBattle;
        if (smoke === undefined) {
            throw new Error(`[smoke] samples module has no autoBattle smoke`);
        }
        // 规模参数经 URL 注入（?smoke=auto-battle&scale=6v6）：缺省 3v3，
        // 传 6 走 6v6 全规模上限渲染验证
        const search = typeof window === "undefined" ? "" : window.location.search;
        const rawScale = new URLSearchParams(search).get("scale");
        const scale = rawScale === null ? undefined : Number(rawScale);
        // 战场动态单位映射经 samples bundle 运行时读取（boot 不静态 import game bundle）
        const unitMapping = (
            lookupBundle("samples") as {
                readonly unitNodeMappings?: Readonly<Record<string, unknown>>;
            }
        )?.unitNodeMappings?.["auto_battle"];
        await smoke(
            this.uiHost,
            () => this.lobbyHost.ensureSharedUiDependencies(),
            // 注入真实 fgui 渲染接缝：战场页动态单位按存活单位实例化 UnitSlot
            {
                nodeResolver: (view) =>
                    unitMapping === undefined
                        ? createFairyGuiViewHandle(view as never)
                        : createDynamicComponentViewHandle(
                              view as never,
                              unitMapping as never,
                          ),
                scale: Number.isFinite(scale) ? (scale as number) : undefined,
            },
        );
    }

    /** 游戏层品类夹具冒烟序列。 */
    async runFixtureSmoke(fixtureId: string): Promise<void> {
        // 冒烟分叉运行在 startup，未切 game 场景：先加载 game+samples 使注册就绪
        await this.loadGameBundle();
        await this.loadSamplesBundle();
        const gameModule = lookupBundle("game") as GameSmokeModule | undefined;
        const smoke = gameModule?.smokes?.fixture;
        if (smoke === undefined) {
            throw new Error(`[smoke] game module has no fixture smoke`);
        }
        await smoke(fixtureId);
    }

    /** 品类夹具性能检查序列（注入 Cocos Profiler 采样器）。 */
    async runFixturePerf(perfFixtureId: string): Promise<void> {
        await this.loadGameBundle();
        await this.loadSamplesBundle();
        const gameModule = lookupBundle("game") as GameSmokeModule | undefined;
        const smoke = gameModule?.smokes?.perf;
        if (smoke === undefined) {
            throw new Error(`[smoke] game module has no perf smoke`);
        }
        await smoke(perfFixtureId, sampleProfilerStats);
    }

    /** 释放：清理冒烟交互钩子（闭包持有组件与宿主）。幂等。 */
    dispose(): void {
        clearModalClickHook();
    }
}

export function createSmokeProxy(deps: SmokeProxyDeps): SmokeProxy {
    return new SmokeProxy(deps);
}
