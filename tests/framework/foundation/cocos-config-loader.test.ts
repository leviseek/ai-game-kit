import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

import { createFairyGuiMock } from "./helpers/fairygui-mock";

import type { ConfigTable } from "../../../assets/framework/contracts/config/Config";
import {
  configNumber,
  configObject,
  configString,
} from "../../../assets/framework/core/config/ConfigTable";
import {
  ConfigLoadError,
  ConfigParseError,
} from "../../../assets/framework/contracts/config/ConfigErrors";
import type { IResourceProvider } from "../../../assets/framework/contracts/resource/ResourceProvider";

// Cocos 适配器值导入 cc（缺省读 cc.assetManager）与 fairygui-cc（UIPackage）；
// bun mock.module 全局共享，首个注册生效，注入 assetManager 后不会触达真实引擎。
mock.module("cc", () => ({ assetManager: {} }));
mock.module("fairygui-cc", () => createFairyGuiMock());

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

interface CocosConfigLoaderFactory {
  createCocosConfigLoader(provider: IResourceProvider): {
    loadConfig(bundle: string, path: string): Promise<ConfigTable>;
  };
}

const projectRoot = resolve(import.meta.dir, "../../..");
const loaderFile = resolve(
  projectRoot,
  "assets/framework/adapters/cocos/config/CocosConfigLoader.ts",
);
const resourceFile = resolve(
  projectRoot,
  "assets/framework/adapters/cocos/resource/CocosResourceProvider.ts",
);

async function loadConfigLoader(): Promise<
  CocosConfigLoaderFactory["createCocosConfigLoader"]
> {
  const exports = (await import(
    pathToFileURL(loaderFile).href
  )) as Partial<CocosConfigLoaderFactory>;

  expect(typeof exports.createCocosConfigLoader).toBe("function");
  return exports.createCocosConfigLoader as CocosConfigLoaderFactory["createCocosConfigLoader"];
}

interface CocosMock {
  readonly manager: CocosAssetManagerLike;
  resolveBundle(name: string): void;
  failBundle(error: Error): void;
  resolveAsset(asset: unknown): void;
  failAsset(error: Error): void;
}

function createCocosMock(): CocosMock {
  const pendingBundleCallbacks: Array<
    (err: Error | null, bundle?: CocosBundleLike) => void
  > = [];
  const pendingAssetCallbacks: Array<
    (err: Error | null, asset?: unknown) => void
  > = [];
  const loadedBundles = new Map<string, CocosBundleLike>();

  const manager: CocosAssetManagerLike = {
    loadBundle(name, onComplete) {
      pendingBundleCallbacks.push(onComplete);
    },
    getBundle(name) {
      return loadedBundles.get(name) ?? null;
    },
    removeBundle(bundle) {
      loadedBundles.delete(bundle.name);
    },
  };

  return {
    manager,
    resolveBundle(name) {
      const bundle: CocosBundleLike = {
        name,
        load(_path, onComplete) {
          pendingAssetCallbacks.push(onComplete);
        },
        releaseAll() {},
      };
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

// 模拟 Cocos JsonAsset：bundle.load 对 .json 资源返回带 `.json` 属性的资产对象
function jsonAsset(content: unknown): { readonly json: unknown } {
  return { json: content };
}

async function loadCocosResourceProvider(
  manager: CocosAssetManagerLike,
): Promise<IResourceProvider> {
  const exports = (await import(
    pathToFileURL(resourceFile).href
  )) as {
    createCocosResourceProvider(options?: {
      readonly assetManager?: CocosAssetManagerLike;
    }): IResourceProvider;
  };
  return exports.createCocosResourceProvider({ assetManager: manager });
}

describe("CocosConfigLoader bundle config loading", () => {
  test("loads a config from a real bundle path and reads typed values", async () => {
    const createCocosConfigLoader = await loadConfigLoader();
    const cocos = createCocosMock();
    const provider = await loadCocosResourceProvider(cocos.manager);
    const loader = createCocosConfigLoader(provider);

    const loading = loader.loadConfig("config", "start.json");
    cocos.resolveBundle("config");
    cocos.resolveAsset(
      jsonAsset({ level: 3, name: "levi", hero: { id: 1, name: "alice" } }),
    );
    const table = await loading;

    expect(table.read("level", configNumber)).toBe(3);
    expect(table.read("name", configString)).toBe("levi");
    expect(table.read("hero", configObject)).toEqual({
      id: 1,
      name: "alice",
    });
  });

  test("config loading never touches a save key-value backend", async () => {
    const createCocosConfigLoader = await loadConfigLoader();
    const cocos = createCocosMock();
    const provider = await loadCocosResourceProvider(cocos.manager);
    const loader = createCocosConfigLoader(provider);

    const loading = loader.loadConfig("config", "settings.json");
    cocos.resolveBundle("config");
    cocos.resolveAsset(jsonAsset({ volume: 0.8 }));

    const table = await loading;
    expect(table.read("volume", configNumber)).toBe(0.8);
  });

  test("bundle load failure surfaces as ConfigLoadError with underlying cause", async () => {
    const createCocosConfigLoader = await loadConfigLoader();
    const cocos = createCocosMock();
    const provider = await loadCocosResourceProvider(cocos.manager);
    const loader = createCocosConfigLoader(provider);
    const underlying = new Error("config bundle missing");

    const loading = loader.loadConfig("config", "start.json");
    cocos.failBundle(underlying);

    try {
      await loading;
      expect.unreachable("load should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigLoadError);
      const loadError = error as ConfigLoadError;
      expect(loadError.bundle).toBe("config");
      expect(loadError.path).toBe("start.json");
      expect(loadError.cause).toBe(underlying);
    }
  });

  test("asset load failure surfaces as ConfigLoadError preserving the resource identity", async () => {
    const createCocosConfigLoader = await loadConfigLoader();
    const cocos = createCocosMock();
    const provider = await loadCocosResourceProvider(cocos.manager);
    const loader = createCocosConfigLoader(provider);
    const underlying = new Error("asset corrupt");

    const loading = loader.loadConfig("config", "start.json");
    cocos.resolveBundle("config");
    cocos.failAsset(underlying);

    await expect(loading).rejects.toBeInstanceOf(ConfigLoadError);

    try {
      await loading;
      expect.unreachable("load should have thrown");
    } catch (error) {
      const loadError = error as ConfigLoadError;
      expect(loadError.bundle).toBe("config");
      expect(loadError.path).toBe("start.json");
      expect(loadError.cause).toBe(underlying);
    }
  });

  test("a config resource that is not a plain object fails as a typed parse error", async () => {
    const createCocosConfigLoader = await loadConfigLoader();
    const cocos = createCocosMock();
    const provider = await loadCocosResourceProvider(cocos.manager);
    const loader = createCocosConfigLoader(provider);

    const loading = loader.loadConfig("config", "malformed.json");
    cocos.resolveBundle("config");
    cocos.resolveAsset(jsonAsset("not-an-object"));

    // 装载成功但内容非纯对象：经 createConfigTable 抛 ConfigParseError，不产生部分状态
    await expect(loading).rejects.toBeInstanceOf(ConfigParseError);
  });
});
