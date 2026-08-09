import { describe, expect, test } from "bun:test";

import { createResourceProvider } from "../../../assets/framework/core/resource/ResourceProvider";
import type { ResourceKey } from "../../../assets/framework/contracts/resource/Resource";
import {
    createSceneFlow,
    type SceneFlow,
    type SceneResources,
    type SceneSwitchResult,
} from "../../../assets/framework/core/scene/SceneFlow";

interface ControlledDeferred {
    readonly resolve: (value: unknown) => void;
    readonly reject: (reason: unknown) => void;
}

interface ControlledLoader {
    readonly calls: readonly ResourceKey[];
    readonly pending: readonly ControlledDeferred[];
    readonly loader: (key: ResourceKey) => Promise<unknown>;
}

function createControlledLoader(): ControlledLoader {
    const calls: ResourceKey[] = [];
    const pending: ControlledDeferred[] = [];

    const loader = (key: ResourceKey): Promise<unknown> => {
        calls.push({ ...key });
        return new Promise((resolve, reject) => {
            pending.push({ resolve, reject });
        });
    };

    return { calls, pending, loader };
}

describe("SceneFlow preload", () => {
    test("preload loads resources in the background without switching the current scene", async () => {
        const { loader, pending } = createControlledLoader();
        const activated: string[] = [];
        const provider = createResourceProvider({ loader, unloadBundle: () => { } });
        const flow = createSceneFlow({
            provider,
            activateScene: async (sceneId: string) => {
                activated.push(sceneId);
            },
        });

        const preloadPromise = flow.preload("scene-b", {
            bundle: "ui",
            paths: ["panel.json"],
        });

        expect(flow.state).toBe("preloading");
        expect(activated).toEqual([]);

        pending[0].resolve({ id: "panel" });
        await preloadPromise;

        expect(activated).toEqual([]);
        expect(flow.state).toBe("idle");
    });

    test("a completed preload is reused by a switchTo of the same scene", async () => {
        const { loader, calls, pending } = createControlledLoader();
        const unloaded: string[] = [];
        const activated: string[] = [];
        const provider = createResourceProvider({
            loader,
            unloadBundle: (bundle: string) => {
                unloaded.push(bundle);
            },
        });
        const flow = createSceneFlow({
            provider,
            activateScene: async (sceneId: string) => {
                activated.push(sceneId);
            },
        });

        const resources: SceneResources = { bundle: "ui", paths: ["panel.json"] };
        const preloadPromise = flow.preload("scene-b", resources);
        expect(calls).toHaveLength(1);
        pending[0].resolve({ id: "panel" });
        await preloadPromise;

        const resultPromise = flow.switchTo("scene-b", resources);
        // 复用路径下不会产生新的底层加载；若不复用则此处会产生第二个 pending
        if (pending.length > 1) {
            pending[1].resolve({ id: "panel" });
        }
        const result = await resultPromise;

        expect(result.ok).toBe(true);
        expect(calls).toHaveLength(1);
        expect(unloaded).toEqual([]);
        expect(activated).toEqual(["scene-b"]);
        expect(provider.canUnload("ui")).toBe(false);
    }, 1000);

    test("a preload is not reused when the switch requests different paths", async () => {
        const { loader, calls, pending } = createControlledLoader();
        const unloaded: string[] = [];
        const activated: string[] = [];
        const provider = createResourceProvider({
            loader,
            unloadBundle: (bundle: string) => {
                unloaded.push(bundle);
            },
        });
        const flow = createSceneFlow({
            provider,
            activateScene: async (sceneId: string) => {
                activated.push(sceneId);
            },
        });

        const preloadPromise = flow.preload("scene-b", {
            bundle: "ui",
            paths: ["panel.json"],
        });
        pending[0].resolve({ id: "panel" });
        await preloadPromise;

        const resultPromise = flow.switchTo("scene-b", {
            bundle: "ui",
            paths: ["other.json"],
        });
        pending[1].resolve({ id: "other" });
        const result = await resultPromise;

        expect(result.ok).toBe(true);
        expect(calls).toHaveLength(2);
        expect(activated).toEqual(["scene-b"]);
        expect(provider.canUnload("ui")).toBe(false);
    }, 1000);
});

describe("SceneFlow progress", () => {
    test("progress is monotonic, stays in [0, 1], and converges on success", async () => {
        const { loader, pending } = createControlledLoader();
        const progresses: number[] = [];
        const provider = createResourceProvider({ loader, unloadBundle: () => { } });
        const flow = createSceneFlow({
            provider,
            activateScene: async () => { },
            onProgress: (_sceneId, progress) => {
                progresses.push(progress);
            },
        });

        const switching = flow.switchTo("scene-a", {
            bundle: "common",
            paths: ["a.png", "b.png", "c.png"],
        });
        pending[0].resolve({});
        pending[1].resolve({});
        pending[2].resolve({});
        const result = await switching;

        expect(result.ok).toBe(true);
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

describe("SceneFlow successful switch", () => {
    test("activates the target scene and transfers resource ownership", async () => {
        const { loader, pending } = createControlledLoader();
        const unloaded: string[] = [];
        const activated: string[] = [];
        const provider = createResourceProvider({
            loader,
            unloadBundle: (bundle: string) => {
                unloaded.push(bundle);
            },
        });
        const flow = createSceneFlow({
            provider,
            activateScene: async (sceneId: string) => {
                activated.push(sceneId);
            },
        });

        const toA = flow.switchTo("scene-a", {
            bundle: "common",
            paths: ["a.png"],
        });
        pending[0].resolve({ id: "a" });
        const resultA = await toA;

        expect(resultA.ok).toBe(true);
        expect(activated).toEqual(["scene-a"]);
        expect(flow.state).toBe("active");
        expect(provider.canUnload("common")).toBe(false);

        const toB = flow.switchTo("scene-b", {
            bundle: "ui",
            paths: ["b.png"],
        });
        pending[1].resolve({ id: "b" });
        const resultB = await toB;

        expect(resultB.ok).toBe(true);
        expect(activated).toEqual(["scene-a", "scene-b"]);
        expect(provider.canUnload("common")).toBe(true);
        expect(provider.canUnload("ui")).toBe(false);
        expect(unloaded).toContain("common");
    });
});

describe("SceneFlow repeated switch rejection", () => {
    test("a second switch to the same target while switching is in progress is rejected", async () => {
        const { loader, pending } = createControlledLoader();
        const activated: string[] = [];
        const provider = createResourceProvider({ loader, unloadBundle: () => { } });
        const flow = createSceneFlow({
            provider,
            activateScene: async (sceneId: string) => {
                activated.push(sceneId);
            },
        });

        const first = flow.switchTo("scene-a", {
            bundle: "common",
            paths: ["a.png"],
        });
        const second = flow.switchTo("scene-a", {
            bundle: "common",
            paths: ["a.png"],
        });

        const secondResult = await second;
        expect(secondResult.ok).toBe(false);
        expect(secondResult.reason).toBeTruthy();

        pending[0].resolve({});
        const firstResult = await first;
        expect(firstResult.ok).toBe(true);
        expect(activated).toHaveLength(1);
    });
});

describe("SceneFlow failed switch", () => {
    test("keeps the current scene usable and returns to a retryable state", async () => {
        const { loader, pending } = createControlledLoader();
        const unloaded: string[] = [];
        const provider = createResourceProvider({
            loader,
            unloadBundle: (bundle: string) => {
                unloaded.push(bundle);
            },
        });
        const flow = createSceneFlow({
            provider,
            activateScene: async () => { },
        });

        const toA = flow.switchTo("scene-a", {
            bundle: "common",
            paths: ["a.png"],
        });
        pending[0].resolve({ id: "a" });
        await toA;

        const toB = flow.switchTo("scene-b", {
            bundle: "ui",
            paths: ["b.png"],
        });
        pending[1].reject(new Error("scene b load failed"));
        const resultB = await toB;

        expect(resultB.ok).toBe(false);
        expect(resultB.sceneId).toBe("scene-b");
        expect(resultB.error).toBeTruthy();

        expect(provider.canUnload("common")).toBe(false);
        expect(unloaded).not.toContain("common");
        expect(flow.state).toBe("failed");
    });

    test("an activation failure keeps the current scene and returns to a retryable state", async () => {
        const { loader, pending } = createControlledLoader();
        const unloaded: string[] = [];
        const provider = createResourceProvider({
            loader,
            unloadBundle: (bundle: string) => {
                unloaded.push(bundle);
            },
        });
        const flow = createSceneFlow({
            provider,
            activateScene: async (sceneId: string) => {
                if (sceneId === "scene-b") {
                    throw new Error("scene activation failed");
                }
            },
        });

        const toA = flow.switchTo("scene-a", {
            bundle: "common",
            paths: ["a.png"],
        });
        pending[0].resolve({ id: "a" });
        const resultA = await toA;

        expect(resultA.ok).toBe(true);
        expect(flow.state).toBe("active");

        const toB = flow.switchTo("scene-b", {
            bundle: "ui",
            paths: ["b.png"],
        });
        pending[1].resolve({ id: "b" });
        const resultB = await toB;

        expect(resultB.ok).toBe(false);
        expect(resultB.sceneId).toBe("scene-b");
        expect(resultB.error).toBeTruthy();
        expect(provider.canUnload("common")).toBe(false);
        expect(unloaded).not.toContain("common");
        expect(flow.state).toBe("failed");
    });

    test("a synchronously throwing activateScene fails the switch without hanging", async () => {
        const { loader, pending } = createControlledLoader();
        const provider = createResourceProvider({ loader, unloadBundle: () => { } });
        const flow = createSceneFlow({
            provider,
            activateScene: () => {
                throw new Error("sync activation boom");
            },
        });

        const switching = flow.switchTo("scene-a", {
            bundle: "common",
            paths: ["a.png"],
        });
        pending[0].resolve({ id: "a" });
        const result = await switching;

        expect(result.ok).toBe(false);
        expect(result.sceneId).toBe("scene-a");
        expect(result.error).toBeTruthy();
        expect(flow.state).toBe("failed");
    });

    test("retry after failure starts clean and reloads resources", async () => {
        const { loader, calls, pending } = createControlledLoader();
        const provider = createResourceProvider({ loader, unloadBundle: () => { } });
        const flow = createSceneFlow({
            provider,
            activateScene: async () => { },
        });

        const first = flow.switchTo("scene-b", {
            bundle: "ui",
            paths: ["b.png"],
        });
        pending[0].reject(new Error("boom"));
        const firstResult = await first;
        expect(firstResult.ok).toBe(false);
        expect(calls).toHaveLength(1);

        const retry = flow.switchTo("scene-b", {
            bundle: "ui",
            paths: ["b.png"],
        });
        expect(calls).toHaveLength(2);
        pending[1].resolve({ id: "b" });
        const retryResult = await retry;

        expect(retryResult.ok).toBe(true);
        expect(flow.state).toBe("active");
    });
});

describe("SceneFlow releasable scope", () => {
    test("disposing the flow cancels an in-flight switch and is idempotent", async () => {
        const { loader, pending } = createControlledLoader();
        const activated: string[] = [];
        const provider = createResourceProvider({ loader, unloadBundle: () => { } });
        const flow = createSceneFlow({
            provider,
            activateScene: async (sceneId: string) => {
                activated.push(sceneId);
            },
        });

        const switching = flow.switchTo("scene-b", {
            bundle: "ui",
            paths: ["b.png"],
        });
        expect(flow.state).toBe("preloading");

        flow.dispose();
        const result = await switching;
        expect(result.ok).toBe(false);
        expect(result.reason).toBeTruthy();
        expect(activated).toEqual([]);

        flow.dispose();
    });

    test("disposing the flow cancels an in-flight preload", async () => {
        const { loader, pending } = createControlledLoader();
        const provider = createResourceProvider({ loader, unloadBundle: () => { } });
        const flow = createSceneFlow({
            provider,
            activateScene: async () => { },
        });

        const preload = flow.preload("scene-b", {
            bundle: "ui",
            paths: ["b.png"],
        });

        flow.dispose();
        await preload;
        expect(pending).toHaveLength(1);
        expect(provider.canUnload("ui")).toBe(true);
    });

    test("disposing during transitioning still resolves and does not leave a dangling activation", async () => {
        const { loader, pending } = createControlledLoader();
        const activated: string[] = [];
        let resolveActivation: (() => void) | undefined;
        const provider = createResourceProvider({ loader, unloadBundle: () => { } });
        const flow = createSceneFlow({
            provider,
            activateScene: (sceneId: string) =>
                new Promise<void>((resolve) => {
                    activated.push(sceneId);
                    resolveActivation = resolve;
                }),
        });

        const switching = flow.switchTo("scene-b", {
            bundle: "ui",
            paths: ["b.png"],
        });
        // 完成资源加载，进入 transitioning（激活已提交但未 resolve）
        pending[0].resolve({ id: "b" });
        await new Promise<void>((r) => setTimeout(r, 0));

        expect(flow.state).toBe("transitioning");

        flow.dispose();
        const result = await switching;

        // 切换被取消：resolve 为失败，不产生成功上报；引擎侧激活可能已发生但不归
        // SceneFlow 管理（契约已在 dispose 注释中声明）
        expect(result.ok).toBe(false);
        expect(result.reason).toBeTruthy();
        expect(activated).toHaveLength(1);

        // 激活回调迟到地 resolve，不得把已释放的 flow 拉回 active：FSM 已 dispose
        // 停止接收事件，状态冻结在 transitioning
        resolveActivation?.();
        await new Promise<void>((r) => setTimeout(r, 0));
        expect(flow.state).toBe("transitioning");
        expect(provider.canUnload("ui")).toBe(true);

        flow.dispose();
    });

    test("disposing the flow releases resources left by a completed preload", async () => {
        const { loader, pending } = createControlledLoader();
        const unloaded: string[] = [];
        const provider = createResourceProvider({
            loader,
            unloadBundle: (bundle: string) => {
                unloaded.push(bundle);
            },
        });
        const flow = createSceneFlow({
            provider,
            activateScene: async () => { },
        });

        const preload = flow.preload("scene-b", {
            bundle: "ui",
            paths: ["b.png"],
        });
        pending[0].resolve({ id: "b" });
        await preload;
        expect(provider.canUnload("ui")).toBe(false);

        flow.dispose();
        expect(provider.canUnload("ui")).toBe(true);
        expect(unloaded).toContain("ui");
    });
});

describe("SceneFlow edge cases", () => {
    test("switchTo with an empty path list still activates the target scene", async () => {
        const { loader, pending } = createControlledLoader();
        const activated: string[] = [];
        const provider = createResourceProvider({ loader, unloadBundle: () => { } });
        const flow = createSceneFlow({
            provider,
            activateScene: async (sceneId: string) => {
                activated.push(sceneId);
            },
        });

        const result = await flow.switchTo("scene-a", {
            bundle: "common",
            paths: [],
        });

        expect(result.ok).toBe(true);
        expect(activated).toEqual(["scene-a"]);
        expect(flow.state).toBe("active");
        expect(pending).toHaveLength(0);
    });

    test("a partial resource failure fails the switch and keeps the current scene", async () => {
        const { loader, pending } = createControlledLoader();
        const unloaded: string[] = [];
        const provider = createResourceProvider({
            loader,
            unloadBundle: (bundle: string) => {
                unloaded.push(bundle);
            },
        });
        const flow = createSceneFlow({
            provider,
            activateScene: async () => { },
        });

        const toA = flow.switchTo("scene-a", {
            bundle: "common",
            paths: ["a.png"],
        });
        pending[0].resolve({ id: "a" });
        await toA;

        const toB = flow.switchTo("scene-b", {
            bundle: "ui",
            paths: ["b.png", "c.png"],
        });
        pending[1].resolve({ id: "b" });
        pending[2].reject(new Error("c failed"));
        const result = await toB;

        expect(result.ok).toBe(false);
        expect(result.sceneId).toBe("scene-b");
        expect(result.error).toBeTruthy();
        expect(provider.canUnload("common")).toBe(false);
        expect(unloaded).not.toContain("common");
    });

    test("a second preload while one is in flight is skipped", async () => {
        const { loader, calls, pending } = createControlledLoader();
        const provider = createResourceProvider({ loader, unloadBundle: () => { } });
        const flow = createSceneFlow({
            provider,
            activateScene: async () => { },
        });

        const first = flow.preload("scene-b", {
            bundle: "ui",
            paths: ["b.png"],
        });
        const second = flow.preload("scene-c", {
            bundle: "common",
            paths: ["c.png"],
        });

        // 进行中的 preload 期间，第二次 preload 被跳过：不产生新的底层加载
        expect(calls).toHaveLength(1);

        pending[0].resolve({ id: "b" });
        await first;
        await second;

        expect(flow.state).toBe("idle");
        expect(calls).toHaveLength(1);
    });

    test("preload with an empty path list completes and stays idle without activating", async () => {
        const { loader, calls } = createControlledLoader();
        const activated: string[] = [];
        const provider = createResourceProvider({ loader, unloadBundle: () => { } });
        const flow = createSceneFlow({
            provider,
            activateScene: async (sceneId: string) => {
                activated.push(sceneId);
            },
        });

        const preload = flow.preload("scene-b", {
            bundle: "ui",
            paths: [],
        });
        await preload;

        expect(activated).toEqual([]);
        expect(flow.state).toBe("idle");
        expect(calls).toHaveLength(0);
    });

    test("preload after a failed switch still works from the failed state", async () => {
        const { loader, calls, pending } = createControlledLoader();
        const provider = createResourceProvider({ loader, unloadBundle: () => { } });
        const flow = createSceneFlow({
            provider,
            activateScene: async () => { },
        });

        const failed = flow.switchTo("scene-b", {
            bundle: "ui",
            paths: ["b.png"],
        });
        pending[0].reject(new Error("boom"));
        await failed;
        expect(flow.state).toBe("failed");

        // failed 态下 preload 走 start 分支进入 preloading，再落回 idle
        const preload = flow.preload("scene-c", {
            bundle: "common",
            paths: ["c.png"],
        });
        pending[1].resolve({ id: "c" });
        await preload;

        expect(flow.state).toBe("idle");
        expect(calls).toHaveLength(2);
    });

    test("switching to the currently active scene performs a fresh switch", async () => {
        const { loader, calls, pending } = createControlledLoader();
        const activated: string[] = [];
        const provider = createResourceProvider({ loader, unloadBundle: () => { } });
        const flow = createSceneFlow({
            provider,
            activateScene: async (sceneId: string) => {
                activated.push(sceneId);
            },
        });

        const first = flow.switchTo("scene-a", {
            bundle: "common",
            paths: ["a.png"],
        });
        pending[0].resolve({ id: "a" });
        const firstResult = await first;
        expect(firstResult.ok).toBe(true);
        expect(flow.state).toBe("active");

        // active 态再次 switchTo 同一场景走 start 分支：重新预加载并激活
        const second = flow.switchTo("scene-a", {
            bundle: "common",
            paths: ["a.png"],
        });
        pending[1].resolve({ id: "a2" });
        const secondResult = await second;

        expect(secondResult.ok).toBe(true);
        expect(activated).toEqual(["scene-a", "scene-a"]);
        expect(calls).toHaveLength(2);
        expect(flow.state).toBe("active");
    });
});
