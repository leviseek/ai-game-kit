import { describe, expect, test } from "bun:test";

import type {
    IResourceProvider,
    SceneResources,
} from "../../../assets/framework";
import {
    createSceneFlow,
    type SceneFlow,
} from "../../../assets/framework/core/scene/SceneFlow";
import { createMemoryResourceProvider } from "../../../assets/framework/adapters/memory/MemoryResourceProvider";
import {
    createBootFlow,
    type BootFlow,
    type BootFlowDeps,
} from "../../../assets/boot/flow/BootFlow";
import {
    createSmokeRouter,
    type SmokeRouter,
} from "../../../assets/boot/flow/SmokeRouter";
import { MemoryLogger } from "../support/MemoryLogger";

interface RecordingLobbyHost {
    ensureSharedUiDependencies: () => Promise<void>;
}

interface RecordingUiHost {
    init: () => void;
}

interface RecordedRun {
    readonly tag: string;
    readonly args: readonly unknown[];
}

function createSmokeRouterRecording(events: string[]): {
    router: SmokeRouter;
    calls: RecordedRun[];
} {
    const calls: RecordedRun[] = [];
    const record =
        (tag: string) =>
        (...args: unknown[]): Promise<void> => {
            calls.push({ tag, args });
            events.push(`smoke:${tag}`);
            return Promise.resolve();
        };
    const router = createSmokeRouter({
        runUiSmoke: record("ui-smoke"),
        runSceneFlowSmoke: record("scene-smoke"),
        runModalClickSmoke: record("modal-click"),
        runCardBattleSmoke: record("card-battle"),
        runAutoBattleSmoke: record("auto-battle"),
        runFixtureSmoke: (fixtureId: string) => {
            calls.push({ tag: "fixture-smoke", args: [fixtureId] });
            events.push(`smoke:fixture:${fixtureId}`);
            return Promise.resolve();
        },
        runFixturePerf: (perfFixtureId: string) => {
            calls.push({ tag: "fixture-perf", args: [perfFixtureId] });
            events.push(`smoke:fixture-perf:${perfFixtureId}`);
            return Promise.resolve();
        },
    });
    return { router, calls };
}

interface Harness {
    readonly bootFlow: BootFlow;
    readonly events: string[];
    readonly activatedScenes: string[];
    readonly hotUpdateCalls: number;
    /** 供资源释放闭环断言（canUnload）观察。 */
    readonly provider: IResourceProvider;
    readonly sceneFlow: SceneFlow;
}

function createHarness(search: string, isNative: boolean): Harness {
    const events: string[] = [];
    const activatedScenes: string[] = [];

    const provider = createMemoryResourceProvider();
    const sceneFlow = createSceneFlow({
        provider,
        activateScene: async (sceneId: string) => {
            activatedScenes.push(sceneId);
            events.push(`activate:${sceneId}`);
        },
    });

    const uiHost: RecordingUiHost = {
        init: () => {
            events.push("ui-init");
        },
    };

    const lobbyHost: RecordingLobbyHost = {
        ensureSharedUiDependencies: async () => {
            events.push("ensure-shared");
        },
    };

    let hotUpdateCalls = 0;
    const { router: smokeRouter } = createSmokeRouterRecording(events);

    const sceneMap: Readonly<Record<string, SceneResources>> = {
        game: Object.freeze({ bundle: "ui", paths: ["placeholder"] }),
    };

    const deps: BootFlowDeps = {
        sceneFlow,
        uiHost,
        lobbyHost,
        smokeRouter,
        getSceneMap: () => sceneMap,
        logger: new MemoryLogger(),
        isNative: () => isNative,
        getSearch: () => search,
        runHotUpdatePlaceholder: async () => {
            hotUpdateCalls += 1;
            events.push("hotupdate");
        },
        scheduleSmoke: (callback) => callback(),
        // 组合根经此回调在 game 激活后装配列表流（本测试以记录事件替代）
        onGameSceneActive: () => {
            events.push("open-list");
        },
    };

    const bootFlow = createBootFlow(deps);
    return {
        bootFlow,
        events,
        activatedScenes,
        provider,
        sceneFlow,
        get hotUpdateCalls() {
            return hotUpdateCalls;
        },
    } satisfies Harness;
}

describe("BootFlow default startup flow", () => {
    test("default no-arg launch: logo → preload → switchTo game → open list page", async () => {
        const harness = createHarness("", false);

        await harness.bootFlow.launch();

        // 状态机收敛到 active，game 场景被单向激活
        expect(harness.bootFlow.state).toBe("active");
        expect(harness.activatedScenes).toEqual(["game"]);
        // 框架级预加载先于切换发生；列表页在 game 激活后打开
        const index = {
            ensure: harness.events.indexOf("ensure-shared"),
            activate: harness.events.indexOf("activate:game"),
            openList: harness.events.indexOf("open-list"),
        };
        expect(index.ensure).toBeGreaterThan(-1);
        expect(index.activate).toBeGreaterThan(index.ensure);
        expect(index.openList).toBeGreaterThan(index.activate);
    });

    test("GRoot is deferred to game first presentation (ui-init after switch)", async () => {
        const harness = createHarness("", false);

        await harness.bootFlow.launch();

        const uiInitIndex = harness.events.indexOf("ui-init");
        const activateIndex = harness.events.indexOf("activate:game");
        expect(uiInitIndex).toBeGreaterThan(-1);
        expect(activateIndex).toBeLessThan(uiInitIndex);
        // 全生命周期只初始化一次
        const uiInitCount = harness.events.filter((e) => e === "ui-init").length;
        expect(uiInitCount).toBe(1);
    });

    test("missing game scene mapping fails the flow without switching", async () => {
        const provider = createMemoryResourceProvider();
        const sceneFlow = createSceneFlow({
            provider,
            activateScene: async (sceneId: string) => {
                throw new Error(`unexpected activation: ${sceneId}`);
            },
        });
        const events: string[] = [];
        const bootFlow = createBootFlow({
            sceneFlow,
            uiHost: { init: () => events.push("ui-init") },
            lobbyHost: {
                ensureSharedUiDependencies: async () => events.push("ensure-shared"),
            },
            smokeRouter: createSmokeRouterRecording(events).router,
            getSceneMap: () => ({}),
            logger: new MemoryLogger(),
            isNative: () => false,
            getSearch: () => "",
            scheduleSmoke: (callback) => callback(),
            onGameSceneActive: () => events.push("open-list"),
        });

        await bootFlow.launch();

        expect(bootFlow.state).toBe("failed");
        expect(events).not.toContain("open-list");
    });
});

describe("BootFlow smoke dispatch", () => {
    test("URL smoke params take priority over the default flow", async () => {
        const harness = createHarness("?smoke=fairygui-ui", false);

        await harness.bootFlow.launch();

        expect(harness.bootFlow.state).toBe("active");
        // 冒烟路径不切换 game 场景、不打开列表页
        expect(harness.activatedScenes).toEqual([]);
        expect(harness.events).not.toContain("open-list");
        // 冒烟序列在 startup 立即初始化 GRoot 后执行
        const uiInitIndex = harness.events.indexOf("ui-init");
        const smokeIndex = harness.events.indexOf("smoke:ui-smoke");
        expect(uiInitIndex).toBeGreaterThan(-1);
        expect(smokeIndex).toBeGreaterThan(uiInitIndex);
    });

    test("fixture smoke param dispatches to the fixture runner", async () => {
        const harness = createHarness("?fixture=card", false);

        await harness.bootFlow.launch();

        expect(harness.events).toContain("smoke:fixture:card");
        expect(harness.activatedScenes).toEqual([]);
    });
});

describe("BootFlow hotupdate stage", () => {
    test("Web platform silently skips the hotupdate stage", async () => {
        const harness = createHarness("", false);

        await harness.bootFlow.launch();

        expect(harness.hotUpdateCalls).toBe(0);
        expect(harness.events).not.toContain("hotupdate");
    });

    test("native platform runs the hotupdate placeholder before preload", async () => {
        const harness = createHarness("", true);

        await harness.bootFlow.launch();

        expect(harness.hotUpdateCalls).toBe(1);
        const hotIndex = harness.events.indexOf("hotupdate");
        const ensureIndex = harness.events.indexOf("ensure-shared");
        expect(hotIndex).toBeGreaterThan(-1);
        expect(hotIndex).toBeLessThan(ensureIndex);
    });
});

describe("BootFlow state and dispose", () => {
    test("dispose before launch prevents further progression", async () => {
        const harness = createHarness("", false);

        harness.bootFlow.dispose();
        await harness.bootFlow.launch();

        // dispose 后 launch 为 no-op，状态保持 logo（未推进）
        expect(harness.bootFlow.state).toBe("logo");
        expect(harness.activatedScenes).toEqual([]);
    });
});

describe("BootFlow preload layering (L0 resident + L1 scene preload)", () => {
    test("L0 framework preload (Common/config) completes before L1 game scene preload", async () => {
        const events: string[] = [];
        const provider = createMemoryResourceProvider();
        const sceneFlow = createSceneFlow({
            provider,
            activateScene: async (sceneId: string) => {
                events.push(`activate:${sceneId}`);
            },
        });
        // 包装 sceneFlow.preload 记录 L1（game 场景 preload）的调用时机
        const wrappedFlow: SceneFlow = {
            get state() {
                return sceneFlow.state;
            },
            preload: (sceneId, resources) => {
                events.push(`preload:${sceneId}`);
                return sceneFlow.preload(sceneId, resources);
            },
            switchTo: (sceneId, resources) => sceneFlow.switchTo(sceneId, resources),
            dispose: () => sceneFlow.dispose(),
        };
        const bootFlow = createBootFlow({
            sceneFlow: wrappedFlow,
            uiHost: { init: () => events.push("ui-init") },
            lobbyHost: {
                ensureSharedUiDependencies: async () => events.push("ensure-shared"),
            },
            smokeRouter: createSmokeRouterRecording(events).router,
            getSceneMap: () => ({
                game: Object.freeze({ bundle: "ui", paths: ["placeholder"] }),
            }),
            logger: new MemoryLogger(),
            isNative: () => false,
            getSearch: () => "",
            preloadFrameworkConfig: async () => events.push("framework-config"),
            scheduleSmoke: (callback) => callback(),
            onGameSceneActive: () => events.push("open-list"),
        });

        await bootFlow.launch();

        const index = {
            ensure: events.indexOf("ensure-shared"),
            config: events.indexOf("framework-config"),
            preload: events.indexOf("preload:game"),
            activate: events.indexOf("activate:game"),
            openList: events.indexOf("open-list"),
        };
        // L0（框架级 Common/config）先于 L1（game 场景 preload），再切换 game、打开列表页
        expect(index.ensure).toBeGreaterThan(-1);
        expect(index.config).toBeGreaterThan(index.ensure);
        expect(index.preload).toBeGreaterThan(index.config);
        expect(index.activate).toBeGreaterThan(index.preload);
        expect(index.openList).toBeGreaterThan(index.activate);
    });

    test("game scene preload reports monotonic progress in [0, 1] during the default flow", async () => {
        const progresses: number[] = [];
        const provider = createMemoryResourceProvider();
        const sceneFlow = createSceneFlow({
            provider,
            activateScene: async () => { },
            onProgress: (_sceneId, progress) => {
                progresses.push(progress);
            },
        });
        const bootFlow = createBootFlow({
            sceneFlow,
            uiHost: { init: () => { } },
            lobbyHost: {
                ensureSharedUiDependencies: async () => { },
            },
            smokeRouter: createSmokeRouterRecording([]).router,
            getSceneMap: () => ({
                game: Object.freeze({ bundle: "ui", paths: ["placeholder"] }),
            }),
            logger: new MemoryLogger(),
            isNative: () => false,
            getSearch: () => "",
            scheduleSmoke: (callback) => callback(),
            onGameSceneActive: () => { },
        });

        await bootFlow.launch();

        // 默认流程 L1 preload 期间进度上报：单调不减、始终在 [0,1]、收敛到终态 1
        expect(progresses.length).toBeGreaterThan(0);
        for (const value of progresses) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
        }
        for (let i = 1; i < progresses.length; i += 1) {
            expect(progresses[i]).toBeGreaterThanOrEqual(progresses[i - 1]);
        }
        expect(progresses[progresses.length - 1]).toBe(1);
    });
});

describe("BootFlow default flow resource release loop", () => {
    test("after switching to game, ui is owned by the game scene and released on scene flow dispose", async () => {
        const harness = createHarness("", false);
        expect(harness.provider.canUnload("ui")).toBe(true);

        await harness.bootFlow.launch();

        // 切 game 后 ui 由 game 场景持有（startup 期流转作用域已转移并释放）
        expect(harness.bootFlow.state).toBe("active");
        expect(harness.activatedScenes).toEqual(["game"]);
        expect(harness.provider.canUnload("ui")).toBe(false);

        // 释放场景流转后 ui 可卸载：资源释放闭环收敛，无泄漏引用
        harness.sceneFlow.dispose();
        expect(harness.provider.canUnload("ui")).toBe(true);
    });
});
