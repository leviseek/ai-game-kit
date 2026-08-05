import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

mock.module("cc", () => ({
  assetManager: {},
}));

import type { IResourceProvider } from "../../../assets/framework/contracts/resource/ResourceProvider";
import type { ResourceKey } from "../../../assets/framework/contracts/resource/Resource";

interface CocosBundleLike {
  readonly name: string;
  load(path: string, onComplete: (err: Error | null, asset?: unknown) => void): void;
  releaseAll(): void;
}

interface CocosAssetManagerLike {
  loadBundle(
    name: string,
    onComplete: (err: Error | null, bundle?: CocosBundleLike) => void,
  ): void;
  getBundle(name: string): CocosBundleLike | null;
  removeBundle(bundle: CocosBundleLike): void;
}

interface CocosResourceProviderFactory {
  createCocosResourceProvider(options?: {
    readonly assetManager?: CocosAssetManagerLike;
  }): IResourceProvider;
}

const projectRoot = resolve(import.meta.dir, "../../..");
const adapterFile = resolve(
  projectRoot,
  "assets/framework/adapters/cocos/resource/CocosResourceProvider.ts",
);

async function loadFactory(): Promise<CocosResourceProviderFactory> {
  const exports = (await import(
    pathToFileURL(adapterFile).href
  )) as Partial<CocosResourceProviderFactory>;

  expect(typeof exports.createCocosResourceProvider).toBe("function");

  return {
    createCocosResourceProvider:
      exports.createCocosResourceProvider as CocosResourceProviderFactory["createCocosResourceProvider"],
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

function createCocosMock(): CocosMock {
  const bundleLoads: string[] = [];
  const assetLoads: Array<{ bundle: string; path: string }> = [];
  const releaseAllCalls: string[] = [];
  const removeBundleCalls: string[] = [];
  const unloadSequence: string[] = [];
  const loadedBundles = new Map<string, CocosBundleLike>();
  const pendingBundleCallbacks: Array<
    (err: Error | null, bundle?: CocosBundleLike) => void
  > = [];
  const pendingAssetCallbacks: Array<
    (err: Error | null, asset?: unknown) => void
  > = [];

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
    expect(cocos.state.assetLoads).toEqual([
      { bundle: "common", path: "config.json" },
    ]);

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
});
