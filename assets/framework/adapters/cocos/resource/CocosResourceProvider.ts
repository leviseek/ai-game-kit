import * as cc from "cc";
import { UIPackage } from "fairygui-cc";
import { createResourceProvider } from "../../../core/resource/ResourceProvider";
import type { IResourceKey } from "../../../contracts/interfaces/IResourceKey";
import type { IResourceProvider } from "../../../contracts/interfaces/IResourceProvider";

// 结构化的引擎接缝：只依赖本适配器用到的能力，便于测试注入 mock
interface CocosBundleLike {
    load(path: string, onComplete: (err: Error | null, asset?: unknown) => void): void;
    releaseAll(): void;
}

interface CocosAssetManagerLike {
    loadBundle(name: string, onComplete: (err: Error | null, bundle?: CocosBundleLike) => void): void;
    getBundle(name: string): CocosBundleLike | null;
    removeBundle(bundle: CocosBundleLike): void;
}

// fairygui-cc 的 UIPackage 静态 API 接缝：真实实现由引擎提供，测试可注入 mock
interface UIPackageLike {
    loadPackage(bundle: CocosBundleLike, path: string, onComplete?: (error: unknown, pkg?: { readonly name: string }) => void): void;
    removePackage(nameOrId: string): void;
}

export interface CocosResourceProviderOptions {
    /** 引擎 assetManager；缺省使用 cc.assetManager，测试可注入 mock。 */
    readonly assetManager?: CocosAssetManagerLike;
    /** FairyGUI UIPackage；缺省使用 fairygui-cc 静态 API，测试可注入 mock。 */
    readonly uiPackage?: UIPackageLike;
}

function defaultUiPackage(): UIPackageLike {
    return {
        loadPackage(bundle, path, onComplete) {
            // bundle 在真实运行时即 AssetManager.Bundle（loadBundle 回调产物），
            // 类型断言集中在 Adapter 边界（design 决策 7 风险预案）
            UIPackage.loadPackage(bundle as unknown as cc.AssetManager.Bundle, path, (error, pkg) => {
                onComplete?.(error as unknown, pkg as { readonly name: string } | undefined);
            });
        },
        removePackage(nameOrId) {
            UIPackage.removePackage(nameOrId);
        },
    };
}

function createCocosLoader(manager: CocosAssetManagerLike, uiPackage: UIPackageLike, registeredPackages: Map<string, Map<string, string>>): (key: IResourceKey) => Promise<unknown> {
    return (key: IResourceKey) =>
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

                if (key.kind === "fairygui-package") {
                    // package 走 FairyGUI 注册表：加载成功后记录 路径→注册名 映射，
                    // 供卸载路径（包级/整 bundle）按注册名清理
                    uiPackage.loadPackage(bundle, key.path, (error, pkg) => {
                        if (error) {
                            reject(error);
                            return;
                        }
                        if (pkg === undefined) {
                            reject(new Error(`Cocos package "${key.path}" in bundle "${key.bundle}" was not loaded`));
                            return;
                        }
                        let byBundle = registeredPackages.get(key.bundle);
                        if (byBundle === undefined) {
                            byBundle = new Map();
                            registeredPackages.set(key.bundle, byBundle);
                        }
                        byBundle.set(key.path, pkg.name);
                        resolve(pkg);
                    });
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

function createCocosUnloadBundle(manager: CocosAssetManagerLike, uiPackage: UIPackageLike, registeredPackages: Map<string, Map<string, string>>): (bundle: string) => void {
    return (bundleName: string) => {
        const bundle = manager.getBundle(bundleName);

        // 从未加载成功的 Bundle 无需卸载（幂等）；但先清理已注册 package，
        // 避免卸载重载后残留 FairyGUI 注册表条目
        if (bundle === null) {
            registeredPackages.delete(bundleName);
            return;
        }

        // 先移除该 Bundle 下注册的全部 package，再 releaseAll + removeBundle。
        // 同 bundle 多 package 按注册逆序移除（后加载的依赖先卸载），对齐逆序释放契约；
        // 跨 bundle 依赖排序是已知限制，待 4.x 依赖拓扑成立后处理。
        const byBundle = registeredPackages.get(bundleName);
        if (byBundle !== undefined) {
            // Array.from 而非展开运算符：Creator 构建会把 `[...iterable]` 转译成
            // `[].concat(iterable)`，concat 不展开 Map values 迭代器导致迭代失效
            for (const name of Array.from(byBundle.values()).reverse()) {
                uiPackage.removePackage(name);
            }
        }
        registeredPackages.delete(bundleName);

        bundle.releaseAll();
        manager.removeBundle(bundle);
    };
}

/**
 * 包级卸载执行器：FGUI package 引用归零（即使 bundle 仍被其它包持有）时从
 * FairyGUI 注册表移除该包。按 路径→注册名 映射定位；未注册/已移除时幂等 no-op。
 */
function createCocosUnloadPackage(uiPackage: UIPackageLike, registeredPackages: Map<string, Map<string, string>>): (bundle: string, path: string) => void {
    return (bundleName: string, path: string): void => {
        const byBundle = registeredPackages.get(bundleName);
        const name = byBundle?.get(path);
        if (name === undefined || byBundle === undefined) {
            return;
        }
        uiPackage.removePackage(name);
        byBundle.delete(path);
        if (byBundle.size === 0) {
            registeredPackages.delete(bundleName);
        }
    };
}

/**
 * Cocos Asset Bundle 适配器：把 bundle 加载/释放映射到 assetManager 语义，
 * 组装成面向业务的 IResourceProvider。加载失败保留底层 cause 与资源标识，
 * 卸载只在 Bundle 不再被任何作用域持有且无进行中加载时触发；fairygui-package
 * 键按 kind 分派到 UIPackage，卸载时先清理 FairyGUI 注册表。
 */
export function createCocosResourceProvider(options: CocosResourceProviderOptions = {}): IResourceProvider {
    // 惰性读取 cc.assetManager：未注入时才使用引擎默认实例
    const manager = options.assetManager ?? cc.assetManager;
    const uiPackage = options.uiPackage ?? defaultUiPackage();
    // 按 Bundle 记录 加载路径→注册名 映射，供卸载路径（包级/整 bundle）调用
    // UIPackage.removePackage 清理 FairyGUI 注册表
    const registeredPackages = new Map<string, Map<string, string>>();

    return createResourceProvider({
        loader: createCocosLoader(manager, uiPackage, registeredPackages),
        unloadBundle: createCocosUnloadBundle(manager, uiPackage, registeredPackages),
        unloadPackage: createCocosUnloadPackage(uiPackage, registeredPackages),
    });
}
