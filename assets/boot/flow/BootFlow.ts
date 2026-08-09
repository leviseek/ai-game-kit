import type { Logger, SceneFlow, SceneResources } from "../../framework";
import {
    createStateMachine,
    type StateTransitionTable,
} from "../../framework";
import type { SmokeAction, SmokeRouter } from "./SmokeRouter";

export type BootFlowState =
    | "logo"
    | "hotupdate"
    | "preload"
    | "dispatch"
    | "active"
    | "failed"
    | "disposed";

/** BootFlow 消费的 UI 根宿主能力：默认流程在 game 激活后 init，冒烟路径在 startup 立即 init。 */
export interface BootFlowUiHost {
    init(): void;
}

/** BootFlow 消费的大厅宿主能力：框架级预加载（Common）与默认列表页打开（含 GRoot 未就绪重试）。 */
export interface BootFlowLobbyHost {
    ensureSharedUiDependencies(): Promise<void>;
    openListPageWithRetry(): void;
}

/**
 * BootFlow 依赖：由组合根注入装配对象（真实 UiHost/GameLobbyHostImpl 满足上述
 * 能力接口）与运行环境接缝。场景映射（sceneMap）显式注入，保证编排器可被 memory
 * 适配器驱动测试（不依赖真实引擎/fgui）。
 */
export interface BootFlowDeps {
    readonly sceneFlow: SceneFlow;
    readonly uiHost: BootFlowUiHost;
    readonly lobbyHost: BootFlowLobbyHost;
    readonly smokeRouter: SmokeRouter;
    /** 场景映射清单：game 场景资源（bundle/paths），供 preload 与 switchTo 复用。 */
    readonly sceneMap: Readonly<Record<string, SceneResources>>;
    readonly logger: Logger;
    /** 原生平台探测：Web 返回 false（热更阶段静默跳过）。 */
    readonly isNative: () => boolean;
    /** 当前 URL 查询串：冒烟分派依据；非浏览器环境返回空串。 */
    readonly getSearch: () => string;
    /** 原生热更阶段占位：呈现纯原生进度 UI；下载引擎未实现。缺省无操作。 */
    readonly runHotUpdatePlaceholder?: () => Promise<void>;
    /** 框架配置加载钩子：Common 之外的配置资源常驻加载；缺省无操作。 */
    readonly preloadFrameworkConfig?: () => Promise<void>;
    /** 冒烟序列调度器：缺省延迟 1000ms 执行（对齐既有冒烟路径的引擎 ready 等待）。 */
    readonly scheduleSmoke?: (callback: () => void) => void;
}

export interface BootFlow {
    readonly state: BootFlowState;
    launch(): Promise<void>;
    dispose(): void;
}

type BootFlowEvent = "next" | "smoke" | "done" | "fail";

/** 启动编排状态机：logo → hotupdate → framework-preload → dispatch（design D1）。 */
const transitions: StateTransitionTable<BootFlowState, BootFlowEvent> = {
    logo: { next: "hotupdate", smoke: "dispatch" },
    hotupdate: { next: "preload" },
    preload: { next: "dispatch" },
    dispatch: { done: "active", fail: "failed" },
    failed: {},
};

/**
 * 启动编排器：以状态机表达启动流程的阶段推进。默认流程 logo（纯原生零 GRoot）→
 * 热更占位（Web 跳过）→ 框架级预加载（L0 Common/config 常驻 + L1 game 场景 preload）
 * → 分派；URL 冒烟参数优先于默认流程，冒烟路径在 startup 立即初始化 GRoot（dev 分叉）。
 * 默认分支经 SceneFlow 单向 switchTo game，激活后首次初始化 UI 并打开默认列表页，
 * 不提供回切 startup（design D6）。
 */
export function createBootFlow(deps: BootFlowDeps): BootFlow {
    const { sceneFlow, uiHost, lobbyHost, smokeRouter, sceneMap, logger } = deps;

    const fsm = createStateMachine<BootFlowState, BootFlowEvent>({
        initial: "logo",
        transitions,
        onTransitionError: (error) => {
            logger.error(
                "[boot] flow state transition error",
                undefined,
                error instanceof Error ? error : undefined,
            );
        },
    });

    let disposed = false;

    /** L0 常驻：Common/Common 与框架配置进全局 uiScope，不走 SceneFlow（避免占单槽位且随流转释放）。 */
    async function preloadFramework(): Promise<void> {
        await lobbyHost.ensureSharedUiDependencies();
        await deps.preloadFrameworkConfig?.();
    }

    /** L1 场景流转：game 场景资源经 SceneFlow.preload（单槽位）预加载，switchTo 复用。 */
    async function preloadGameScene(): Promise<void> {
        const game = sceneMap["game"];
        if (game === undefined) {
            return;
        }
        await sceneFlow.preload("game", game);
    }

    /** 热更阶段：仅原生平台启用，Web 静默跳过；占位进度 UI 不依赖 fgui/Common。 */
    async function runHotUpdate(): Promise<void> {
        if (!deps.isNative()) {
            return;
        }
        await deps.runHotUpdatePlaceholder?.();
    }

    /** 冒烟分叉：startup 立即初始化 GRoot，随后按调度执行冒烟序列（dev 分叉）。 */
    function runSmoke(action: SmokeAction): Promise<void> {
        uiHost.init();
        return new Promise<void>((resolve) => {
            const schedule = deps.scheduleSmoke ?? ((cb) => setTimeout(cb, 1000));
            schedule(() => {
                action
                    .run()
                    .catch((error) => {
                        console.error(`[${action.tag}] sequence error`, error);
                    })
                    .then(resolve);
            });
        });
    }

    /** 默认分支：单向 switchTo game，激活后首次初始化 UI 根并打开默认列表页。 */
    async function runDefault(): Promise<void> {
        const game = sceneMap["game"];
        if (game === undefined) {
            logger.error('[boot] missing scene mapping for "game"');
            fsm.send("fail");
            return;
        }
        const result = await sceneFlow.switchTo("game", game);
        if (result.ok !== true) {
            logger.error(
                "[boot] switch to game scene failed",
                undefined,
                result.error instanceof Error ? result.error : undefined,
            );
            fsm.send("fail");
            return;
        }
        // game 场景激活后首次呈现：初始化 UI 根 + 打开默认列表页（openListPageWithRetry 语义保留）
        uiHost.init();
        lobbyHost.openListPageWithRetry();
        fsm.send("done");
    }

    async function launch(): Promise<void> {
        if (disposed) {
            return;
        }
        const action = smokeRouter.resolve(deps.getSearch());
        if (action !== null) {
            // URL 冒烟参数优先：跳过框架预加载，直接在 startup 执行冒烟序列
            fsm.send("smoke");
            await runSmoke(action);
            fsm.send("done");
            return;
        }
        fsm.send("next");
        await runHotUpdate();
        fsm.send("next");
        await preloadFramework();
        await preloadGameScene();
        fsm.send("next");
        await runDefault();
    }

    function dispose(): void {
        disposed = true;
        fsm.dispose();
    }

    return {
        get state(): BootFlowState {
            return fsm.state;
        },
        launch,
        dispose,
    };
}
