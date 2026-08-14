import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

import { createFairyGuiMock } from "./helpers/fairygui-mock";

mock.module("cc", () => ({
    assetManager: {},
}));

// 3.3 让 loader 按 kind 分派到 UIPackage：实现会值导入 fairygui-cc，
// 统一使用共享 fixture（bun mock.module 全局共享首个生效，保证全量运行符号齐全）。
mock.module("fairygui-cc", () => createFairyGuiMock());

import type { IResourceProvider } from "../../../assets/framework/contracts/interfaces/IResourceProvider";

interface CocosBundleLike {
    readonly name: string;
    load(path: string, onComplete: (err: Error | null, asset?: unknown) => void): void;
    releaseAll(): void;
}

interface CocosAssetManagerLike {
    loadBundle(name: string, onComplete: (err: Error | null, bundle?: CocosBundleLike) => void): void;
    getBundle(name: string): CocosBundleLike | null;
    removeBundle(bundle: CocosBundleLike): void;
}

interface CocosResourceProviderFactory {
    createCocosResourceProvider(options?: { readonly assetManager?: CocosAssetManagerLike }): IResourceProvider;
}

const projectRoot = resolve(import.meta.dir, "../../..");
const adapterFile = resolve(projectRoot, "assets/framework/adapters/cocos/resource/CocosResourceProvider.ts");

async function loadFactory(): Promise<CocosResourceProviderFactory> {
    const exports = (await import(pathToFileURL(adapterFile).href)) as Partial<CocosResourceProviderFactory>;

    expect(typeof exports.createCocosResourceProvider).toBe("function");

    return {
        createCocosResourceProvider: exports.createCocosResourceProvider as CocosResourceProviderFactory["createCocosResourceProvider"],
    };
}

interface CocosMockState {
    readonly bundleLoads: readonly string[];
    readonly assetLoads: readonly Array<{ bundle: string; path: string }>;
    readonly releaseAllCalls: readonly string[];
    readonly removeBundleCalls: readonly string[];
    readonly unloadSequence: readonly string[];
}

interface CocosMock {
    readonly manager: CocosAssetManagerLike;
    readonly state: CocosMockState;
    resolveBundle(name: string): void;
    failBundle(error: Error): void;
    resolveAsset(asset: unknown): void;
    failAsset(error: Error): void;
}

// 模拟 fairygui-cc 的 UIPackage 静态 API（3.3 loader kind 分派的目标）
interface UIPackageLike {
    loadPackage(bundle: CocosBundleLike, path: string, onComplete?: (error: unknown, pkg?: { readonly name: string }) => void): void;
    removePackage(nameOrId: string): void;
}

interface UIPackageMock {
    readonly uiPackage: UIPackageLike;
    readonly state: {
        readonly packageLoads: readonly Array<{ bundle: string; path: string }>;
        readonly removeCalls: readonly string[];
    };
    resolvePackage(pkgName: string): void;
    failPackage(error: Error): void;
}

function createUIPackageMock(): UIPackageMock {
    const packageLoads: Array<{ bundle: string; path: string }> = [];
    const removeCalls: string[] = [];
    const pending: Array<(error: unknown, pkg?: { readonly name: string }) => void> = [];

    const uiPackage: UIPackageLike = {
        loadPackage(bundle, path, onComplete) {
            packageLoads.push({ bundle: bundle.name, path });
            if (onComplete !== undefined) {
                pending.push(onComplete);
            }
        },
        removePackage(nameOrId) {
            removeCalls.push(nameOrId);
        },
    };

    return {
        uiPackage,
        state: { packageLoads, removeCalls },
        resolvePackage(pkgName) {
            pending.shift()?.(null, { name: pkgName });
        },
        failPackage(error) {
            pending.shift()?.(error);
        },
    };
}

function createCocosMock(): CocosMock {
    const bundleLoads: string[] = [];
    const assetLoads: Array<{ bundle: string; path: string }> = [];
    const releaseAllCalls: string[] = [];
    const removeBundleCalls: string[] = [];
    const unloadSequence: string[] = [];
    const loadedBundles = new Map<string, CocosBundleLike>();
    const pendingBundleCallbacks: Array<(err: Error | null, bundle?: CocosBundleLike) => void> = [];
    const pendingAssetCallbacks: Array<(err: Error | null, asset?: unknown) => void> = [];

    function makeBundle(name: string): CocosBundleLike {
        return {
            name,
            load(path, onComplete) {
                assetLoads.push({ bundle: name, path });
                pendingAssetCallbacks.push(onComplete);
            },
            releaseAll() {
                releaseAllCalls.push(name);
                unloadSequence.push("releaseAll");
            },
        };
    }

    const manager: CocosAssetManagerLike = {
        loadBundle(name, onComplete) {
            bundleLoads.push(name);
            pendingBundleCallbacks.push(onComplete);
        },
        getBundle(name) {
            return loadedBundles.get(name) ?? null;
        },
        removeBundle(bundle) {
            removeBundleCalls.push(bundle.name);
            unloadSequence.push("removeBundle");
            loadedBundles.delete(bundle.name);
        },
    };

    return {
        manager,
        state: {
            bundleLoads,
            assetLoads,
            releaseAllCalls,
            removeBundleCalls,
            unloadSequence,
        },
        resolveBundle(name) {
            const bundle = makeBundle(name);
            loadedBundles.set(name, bundle);
            pendingBundleCallbacks.shift()?.(null, bundle);
        },
        failBundle(error) {
            pendingBundleCallbacks.shift()?.(error);
        },
        resolveAsset(asset) {
            pendingAssetCallbacks.shift()?.(null, asset);
        },
        failAsset(error) {
            pendingAssetCallbacks.shift()?.(error);
        },
    };
}

describe("CocosResourceProvider", () => {
    test("loads a bundle and then a resource through the provider", async () => {
        const { createCocosResourceProvider } = await loadFactory();
        const cocos = createCocosMock();
        const provider = createCocosResourceProvider({ assetManager: cocos.manager });

        const handle = provider.load("common", "config.json");

        expect(handle.state).toBe("loading");
        expect(cocos.state.bundleLoads).toEqual(["common"]);

        cocos.resolveBundle("common");
        expect(cocos.state.assetLoads).toEqual([{ bundle: "common", path: "config.json" }]);

        const asset = { id: "cfg" };
        cocos.resolveAsset(asset);
        await handle.done;

        expect(handle.state).toBe("ready");
        expect(handle.resource).toBe(asset);
    });

    test("propagates bundle load failure with cause and resource identity", async () => {
        const { createCocosResourceProvider } = await loadFactory();
        const cocos = createCocosMock();
        const provider = createCocosResourceProvider({ assetManager: cocos.manager });
        const original = new Error("bundle manifest missing");

        const handle = provider.load("common", "config.json");
        cocos.failBundle(original);
        await handle.done;

        expect(handle.state).toBe("failed");

        const failure = handle.error as { cause?: unknown; message: string };
        expect(failure.cause).toBe(original);
        expect(failure.message).toMatch(/config\.json/);
        expect(failure.message).toMatch(/common/);
    });

    test("propagates asset load failure without losing the resource identity", async () => {
        const { createCocosResourceProvider } = await loadFactory();
        const cocos = createCocosMock();
        const provider = createCocosResourceProvider({ assetManager: cocos.manager });
        const original = new Error("asset corrupt");

        const handle = provider.load("ui", "main.png");
        cocos.resolveBundle("ui");
        cocos.failAsset(original);
        await handle.done;

        expect(handle.state).toBe("failed");

        const failure = handle.error as { cause?: unknown; message: string };
        expect(failure.cause).toBe(original);
        expect(failure.message).toMatch(/main\.png/);
        expect(failure.message).toMatch(/ui/);
    });

    test("concurrent loads of different resources in the same bundle each trigger a bundle load, relying on engine merge semantics", async () => {
        const { createCocosResourceProvider } = await loadFactory();
        const cocos = createCocosMock();
        const provider = createCocosResourceProvider({ assetManager: cocos.manager });

        const a = provider.load("common", "a.png");
        const b = provider.load("common", "b.png");

        // 协调器按资源键去重，不按 Bundle 去重；同 Bundle 并发由引擎 loadBundle 合并
        expect(cocos.state.bundleLoads).toEqual(["common", "common"]);

        cocos.resolveBundle("common");
        cocos.resolveBundle("common");
        expect(cocos.state.assetLoads).toEqual([
            { bundle: "common", path: "a.png" },
            { bundle: "common", path: "b.png" },
        ]);

        cocos.resolveAsset({ id: "a" });
        cocos.resolveAsset({ id: "b" });
        await a.done;
        await b.done;

        expect(a.state).toBe("ready");
        expect(b.state).toBe("ready");
    });

    test("unloadBundle releases all assets and removes the bundle when no longer owned", async () => {
        const { createCocosResourceProvider } = await loadFactory();
        const cocos = createCocosMock();
        const provider = createCocosResourceProvider({ assetManager: cocos.manager });

        const scope = provider.createScope();
        const handle = provider.load("common", "config.json");
        cocos.resolveBundle("common");
        cocos.resolveAsset({ id: "cfg" });
        await handle.done;

        scope.retain(handle);
        expect(provider.canUnload("common")).toBe(false);

        scope.release();

        expect(provider.canUnload("common")).toBe(true);
        expect(cocos.state.releaseAllCalls).toEqual(["common"]);
        expect(cocos.state.removeBundleCalls).toEqual(["common"]);
        // 契约顺序：先 releaseAll 释放资产，再 removeBundle 移除 Bundle
        expect(cocos.state.unloadSequence).toEqual(["releaseAll", "removeBundle"]);
    });

    test("unloading a bundle that was never loaded is a no-op", async () => {
        const { createCocosResourceProvider } = await loadFactory();
        const cocos = createCocosMock();
        const provider = createCocosResourceProvider({ assetManager: cocos.manager });

        const scope = provider.createScope();
        const handle = provider.load("common", "config.json");
        cocos.failBundle(new Error("bundle missing"));
        await handle.done;

        scope.retain(handle);
        scope.release();

        expect(cocos.state.releaseAllCalls).toEqual([]);
        expect(cocos.state.removeBundleCalls).toEqual([]);
    });

    test("loadPackage dispatches to UIPackage.loadPackage instead of a plain asset load", async () => {
        const { createCocosResourceProvider } = await loadFactory();
        const cocos = createCocosMock();
        const pkg = createUIPackageMock();
        const provider = createCocosResourceProvider({
            assetManager: cocos.manager,
            uiPackage: pkg.uiPackage,
        });

        const handle = provider.loadPackage("ui", "main");

        expect(handle.state).toBe("loading");
        expect(cocos.state.bundleLoads).toEqual(["ui"]);

        cocos.resolveBundle("ui");
        // 双路 settle：红期（未分派）走 bundle.load，转绿后走 UIPackage.loadPackage，
        // 两条路径都落定，红期才能快速失败而非挂起
        pkg.resolvePackage("main");
        cocos.resolveAsset({ name: "main" });
        await handle.done;

        // 分派断言：package 必须走 UIPackage，不得走普通 asset 加载路径
        expect(pkg.state.packageLoads).toEqual([{ bundle: "ui", path: "main" }]);
        expect(cocos.state.assetLoads).toEqual([]);
        expect(handle.state).toBe("ready");
        expect(handle.resource).toEqual({ name: "main" });
    });

    test("propagates package load failure with cause and resource identity", async () => {
        const { createCocosResourceProvider } = await loadFactory();
        const cocos = createCocosMock();
        const pkg = createUIPackageMock();
        const provider = createCocosResourceProvider({
            assetManager: cocos.manager,
            uiPackage: pkg.uiPackage,
        });
        const original = new Error("package manifest corrupt");

        const handle = provider.loadPackage("ui", "main");
        cocos.resolveBundle("ui");
        // 双路 settle：红期走 asset 失败，转绿后走 package 失败
        pkg.failPackage(original);
        cocos.failAsset(original);
        await handle.done;

        expect(handle.state).toBe("failed");

        const failure = handle.error as { cause?: unknown; message: string };
        expect(failure.cause).toBe(original);
        expect(failure.message).toMatch(/main/);
        expect(failure.message).toMatch(/ui/);
        // 锁定失败确实走了 package 分派路径（红期走 asset 时此断言会失败）
        expect(pkg.state.packageLoads).toEqual([{ bundle: "ui", path: "main" }]);
        expect(cocos.state.assetLoads).toEqual([]);
    });

    test("unloadBundle removes registered packages before releasing the bundle", async () => {
        const { createCocosResourceProvider } = await loadFactory();
        const cocos = createCocosMock();
        const pkg = createUIPackageMock();
        const unloadOrder: string[] = [];
        const trackingPkg: UIPackageLike = {
            loadPackage: (bundle, path, onComplete) => pkg.uiPackage.loadPackage(bundle, path, onComplete),
            removePackage(nameOrId) {
                unloadOrder.push(`removePackage:${nameOrId}`);
                pkg.uiPackage.removePackage(nameOrId);
            },
        };
        const provider = createCocosResourceProvider({
            assetManager: cocos.manager,
            uiPackage: trackingPkg,
        });

        const scope = provider.createScope();
        const handle = provider.loadPackage("ui", "main");
        cocos.resolveBundle("ui");
        // 双路 settle：红期走 asset 路径，转绿后走 package 路径
        pkg.resolvePackage("main");
        cocos.resolveAsset({ name: "main" });
        await handle.done;
        scope.retain(handle);

        expect(provider.canUnload("ui")).toBe(false);

        scope.release();

        expect(provider.canUnload("ui")).toBe(true);
        // package 注册表先清理，再 releaseAll + removeBundle（removePackage 在 releaseAll 前）
        expect(pkg.state.removeCalls).toEqual(["main"]);
        expect(unloadOrder).toEqual(["removePackage:main"]);
        expect(cocos.state.unloadSequence).toEqual(["releaseAll", "removeBundle"]);
    });

    test("unloadBundle removes multiple packages in reverse registration order", async () => {
        const { createCocosResourceProvider } = await loadFactory();
        const cocos = createCocosMock();
        const pkg = createUIPackageMock();
        const provider = createCocosResourceProvider({
            assetManager: cocos.manager,
            uiPackage: pkg.uiPackage,
        });

        const scope = provider.createScope();
        const a = provider.loadPackage("ui", "a");
        cocos.resolveBundle("ui");
        pkg.resolvePackage("a");
        cocos.resolveAsset({ name: "a" });
        await a.done;
        scope.retain(a);

        const b = provider.loadPackage("ui", "b");
        cocos.resolveBundle("ui");
        pkg.resolvePackage("b");
        cocos.resolveAsset({ name: "b" });
        await b.done;
        scope.retain(b);

        scope.release();

        // 同 bundle 两 package：后加载的 b 先移除，再移除 a（逆序）
        expect(pkg.state.removeCalls).toEqual(["b", "a"]);
    });
});
