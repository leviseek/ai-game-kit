import * as cc from "cc";
import { createResourceProvider } from "../../../core/resource/ResourceProvider";
import type { ResourceKey } from "../../../contracts/resource/Resource";
import type { IResourceProvider } from "../../../contracts/resource/ResourceProvider";

// 结构化的引擎接缝：只依赖本适配器用到的能力，便于测试注入 mock
interface CocosBundleLike {
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

export interface CocosResourceProviderOptions {
  /** 引擎 assetManager；缺省使用 cc.assetManager，测试可注入 mock。 */
  readonly assetManager?: CocosAssetManagerLike;
}

function createCocosLoader(
  manager: CocosAssetManagerLike,
): (key: ResourceKey) => Promise<unknown> {
  return (key: ResourceKey) =>
    new Promise((resolve, reject) => {
      manager.loadBundle(key.bundle, (bundleError, bundle) => {
        if (bundleError) {
          // 原样传递引擎错误，由加载协调器包装为含 cause 与资源标识的失败
          reject(bundleError);
          return;
        }

        if (bundle === undefined) {
          reject(new Error(`Cocos bundle "${key.bundle}" was not loaded`));
          return;
        }

        bundle.load(key.path, (assetError, asset) => {
          if (assetError) {
            reject(assetError);
            return;
          }

          resolve(asset);
        });
      });
    });
}

function createCocosUnloadBundle(
  manager: CocosAssetManagerLike,
): (bundle: string) => void {
  return (bundleName: string) => {
    const bundle = manager.getBundle(bundleName);

    // 从未加载成功的 Bundle 无需卸载（幂等）
    if (bundle === null) {
      return;
    }

    bundle.releaseAll();
    manager.removeBundle(bundle);
  };
}

/**
 * Cocos Asset Bundle 适配器：把 bundle 加载/释放映射到 assetManager 语义，
 * 组装成面向业务的 IResourceProvider。加载失败保留底层 cause 与资源标识，
 * 卸载只在 Bundle 不再被任何作用域持有且无进行中加载时触发。
 */
export function createCocosResourceProvider(
  options: CocosResourceProviderOptions = {},
): IResourceProvider {
  // 惰性读取 cc.assetManager：未注入时才使用引擎默认实例
  const manager = options.assetManager ?? cc.assetManager;

  return createResourceProvider({
    loader: createCocosLoader(manager),
    unloadBundle: createCocosUnloadBundle(manager),
  });
}
