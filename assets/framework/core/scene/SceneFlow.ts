import type { IResourceProvider } from "../../contracts/resource/ResourceProvider";
import type { ResourceHandle } from "../../contracts/resource/Resource";
import type { ResourceScope } from "../../contracts/resource/ResourceScope";
import {
    createStateMachine,
    type StateTransitionTable,
} from "../fsm/StateMachine";
import type { DisposeHandle } from "../scheduling/DisposeHandle";

export type SceneFlowState =
    | "idle"
    | "preloading"
    | "transitioning"
    | "active"
    | "failed";

/** 目标场景的资源清单：单个 Bundle 下的路径集合。 */
export interface SceneResources {
    readonly bundle: string;
    readonly paths: readonly string[];
}

/** 场景切换结果：ok=false 时携带场景标识与失败原因/错误。 */
export interface SceneSwitchResult {
    readonly ok: boolean;
    readonly sceneId: string;
    readonly error?: unknown;
    readonly reason?: string;
}

export interface SceneFlowOptions {
    readonly provider: IResourceProvider;
    /** 激活目标场景的接缝：由 Cocos 场景适配器注入，映射到 cc.director.loadScene。 */
    readonly activateScene: (sceneId: string) => Promise<void>;
    /** 进度上报：progress 单调不减且处于 [0, 1]，切换完成或失败后收敛到终态。 */
    readonly onProgress?: (sceneId: string, progress: number) => void;
    readonly onError?: (error: unknown) => void;
}

export interface SceneFlow {
    readonly state: SceneFlowState;
    /** 后台预加载目标场景资源，不切换当前场景；完成或取消后落定。 */
    preload(sceneId: string, resources: SceneResources): Promise<void>;
    /**
     * 完整切换流程：预加载 → 激活目标场景 → 所有权转移。切换进行中重复发起
     * 会被拒绝并返回原因；失败保留当前场景并回到可重试状态。
     */
    switchTo(
        sceneId: string,
        resources: SceneResources,
    ): Promise<SceneSwitchResult>;
    /**
     * 释放流转作用域与当前激活场景作用域：取消未完成的预加载/切换并释放
     * 已激活场景持有的资源，幂等。注意若在切换激活已提交后释放，引擎场景
     * 仍会被加载但不归 SceneFlow 管理。
     */
    dispose(): DisposeHandle;
}

type SceneFlowEvent =
    | "start"
    | "preloaded"
    | "preloadDone"
    | "activated"
    | "failed";

const transitions: StateTransitionTable<SceneFlowState, SceneFlowEvent> = {
    idle: { start: "preloading" },
    preloading: {
        preloaded: "transitioning",
        preloadDone: "idle",
        failed: "failed",
    },
    transitioning: { activated: "active", failed: "failed" },
    active: { start: "preloading" },
    failed: { start: "preloading" },
};

const NOOP_HANDLE: DisposeHandle = { dispose: () => { } };

/**
 * 引擎无关的场景流转编排器。复用 core/fsm/StateMachine 表达确定性的状态转移；
 * 预加载与激活的异步完成/失败由回调转换为 FSM 事件。dispose 取消进行中工作并
 * 使 FSM 停止接收事件，保证失败或释放后不残留半激活状态。
 */
export function createSceneFlow(options: SceneFlowOptions): SceneFlow {
    const { provider, activateScene } = options;
    const onProgress = options.onProgress;
    const reportFailure =
        options.onError ?? ((error: unknown) => console.error(error));

    const fsm = createStateMachine<SceneFlowState, SceneFlowEvent>({
        initial: "idle",
        transitions,
        onTransitionError: reportFailure,
    });

    let disposed = false;
    let flowScope: ResourceScope | undefined;
    let sceneScope: ResourceScope | undefined;
    let cancelSwitch: (() => void) | undefined;
    let cancelPreload: (() => void) | undefined;
    // 已完成预加载且可被 switchTo 复用的场景资源（handle 仍 retain 在 flowScope 中）；
    // 是否可复用由 switchTo 的判定（sceneId + bundle/paths 一致 + 全部 ready）决定。
    let preloadedSceneId: string | undefined;
    let preloadedResourcesKey: string | undefined;
    let preloadedHandles: ResourceHandle[] = [];

    function currentFlowScope(): ResourceScope {
        try {
            flowScope?.release();
        } catch {
            // 卸载失败不阻塞新操作的开始；该次流转的资源已不可用，由新操作重新加载
        }
        preloadedSceneId = undefined;
        preloadedResourcesKey = undefined;
        preloadedHandles = [];
        const next = provider.createScope();
        flowScope = next;
        return next;
    }

    function switchTo(
        sceneId: string,
        resources: SceneResources,
    ): Promise<SceneSwitchResult> {
        return new Promise((resolve) => {
            if (disposed) {
                resolve({ ok: false, sceneId, reason: "disposed" });
                return;
            }
            if (fsm.state === "preloading" || fsm.state === "transitioning") {
                resolve({ ok: false, sceneId, reason: "a switch is already in progress" });
                return;
            }

            // 命中已完成预加载的目标场景时复用其 handle：不失效缓存、不重新加载，
            // 直接进入激活；否则创建新流转作用域并重新走加载流程。复用要求 bundle 与
            // paths 清单一致，避免同 sceneId 不同资源被误复用。
            const resourcesKey = JSON.stringify([
                resources.bundle,
                resources.paths,
            ]);
            const reusable =
                preloadedSceneId === sceneId &&
                preloadedResourcesKey === resourcesKey &&
                preloadedHandles.every((handle) => handle.state === "ready");

            let scope: ResourceScope;
            let handles: ResourceHandle[];

            if (reusable) {
                scope = flowScope as ResourceScope;
                handles = preloadedHandles;
                preloadedSceneId = undefined;
                preloadedResourcesKey = undefined;
                preloadedHandles = [];
            } else {
                scope = currentFlowScope();
                handles = [];

                // 重试/场景切换会命中"卸载后同 key 重载返回缓存终态"，先失效再加载，
                // 保证每次切换都走新的底层加载（参见 LoadCoordinator.invalidate）。
                for (const path of resources.paths) {
                    provider.invalidate(resources.bundle, path);
                }
            }

            fsm.send("start");

            let finished = false;
            const finish = (result: SceneSwitchResult): void => {
                if (finished) {
                    return;
                }
                finished = true;
                cancelSwitch = undefined;
                resolve(result);
            };

            const fail = (error: unknown): void => {
                try {
                    scope.release();
                } catch {
                    // 卸载失败不掩盖加载失败：FSM 仍须收敛到 failed，Promise 仍须 resolve
                }
                fsm.send("failed");
                finish({ ok: false, sceneId, error });
            };

            cancelSwitch = () => {
                try {
                    scope.release();
                } catch {
                    // dispose 取消路径的卸载失败不中断后续释放
                }
                finish({ ok: false, sceneId, reason: "disposed" });
            };

            const proceedToActivate = (): void => {
                if (disposed) {
                    return;
                }

                fsm.send("preloaded");
                onProgress?.(sceneId, 1);

                // 包装成 Promise 调用：activateScene 同步抛错也走失败分支，
                // 避免异常逃逸成 unhandled rejection 导致切换悬挂。
                Promise.resolve()
                    .then(() => activateScene(sceneId))
                    .then(
                        () => {
                            if (disposed) {
                                return;
                            }

                            // 所有权转移：目标场景作用域先增持，再释放被替换场景与流转作用域，
                            // 避免中间引用归零触发误卸载。释放失败不中断转移与成功上报。
                            const target = provider.createScope();
                            for (const handle of handles) {
                                target.retain(handle);
                            }
                            try {
                                sceneScope?.release();
                            } catch {
                                // 被替换场景卸载失败不掩盖切换成功
                            }
                            try {
                                scope.release();
                            } catch {
                                // 流转作用域卸载失败不掩盖切换成功
                            }
                            sceneScope = target;

                            fsm.send("activated");
                            finish({ ok: true, sceneId });
                        },
                        (error: unknown) => {
                            if (disposed) {
                                return;
                            }
                            fail(error);
                        },
                    );
            };

            if (reusable) {
                proceedToActivate();
                return;
            }

            const total = resources.paths.length;
            let completed = 0;
            let firstError: unknown;

            if (total === 0) {
                proceedToActivate();
                return;
            }

            for (const path of resources.paths) {
                const handle = provider.load(resources.bundle, path);
                scope.retain(handle);
                handles.push(handle);

                handle.done.then(() => {
                    if (finished || disposed) {
                        return;
                    }
                    completed += 1;
                    if (handle.state === "failed" && firstError === undefined) {
                        firstError = handle.error;
                    }
                    onProgress?.(sceneId, completed / total);

                    if (completed === total) {
                        if (firstError !== undefined) {
                            fail(firstError);
                        } else {
                            proceedToActivate();
                        }
                    }
                });
            }
        });
    }

    function preload(sceneId: string, resources: SceneResources): Promise<void> {
        return new Promise((resolve) => {
            if (disposed) {
                resolve();
                return;
            }
            if (fsm.state === "preloading" || fsm.state === "transitioning") {
                resolve();
                return;
            }

            const scope = currentFlowScope();
            const handles: ResourceHandle[] = [];
            fsm.send("start");

            for (const path of resources.paths) {
                provider.invalidate(resources.bundle, path);
            }

            let finished = false;
            const finish = (): void => {
                if (finished) {
                    return;
                }
                finished = true;
                cancelPreload = undefined;

                // dispose 后不再记录预加载结果：流转作用域立即被释放，记录只会是
                // 指向已释放资源的无效句柄
                if (disposed) {
                    resolve();
                    return;
                }

                // 预加载完成的资源保留在流转作用域中供后续 switchTo 复用。无论成败都
                // 记录，是否真正可复用由 switchTo 判定（全部 ready 才复用，含失败的
                // 预加载结果会被排除并重新加载）。
                if (handles.length === resources.paths.length) {
                    preloadedSceneId = sceneId;
                    preloadedResourcesKey = JSON.stringify([
                        resources.bundle,
                        resources.paths,
                    ]);
                    preloadedHandles = handles;
                }
                fsm.send("preloadDone");
                resolve();
            };

            cancelPreload = finish;

            const total = resources.paths.length;
            let completed = 0;

            if (total === 0) {
                finish();
                return;
            }

            for (const path of resources.paths) {
                const handle = provider.load(resources.bundle, path);
                scope.retain(handle);
                handles.push(handle);

                handle.done.then(() => {
                    if (finished || disposed) {
                        return;
                    }
                    completed += 1;
                    onProgress?.(sceneId, completed / total);
                    if (completed === total) {
                        finish();
                    }
                });
            }
        });
    }

    function dispose(): DisposeHandle {
        if (disposed) {
            return NOOP_HANDLE;
        }
        disposed = true;
        cancelSwitch?.();
        cancelPreload?.();
        try {
            flowScope?.release();
        } catch {
            // 流转作用域卸载失败不中断后续释放与 FSM 释放
        }
        try {
            sceneScope?.release();
        } catch {
            // 当前场景卸载失败不中断 FSM 释放
        }
        fsm.dispose();
        return NOOP_HANDLE;
    }

    return {
        get state(): SceneFlowState {
            return fsm.state;
        },
        preload,
        switchTo,
        dispose,
    };
}
