import type { IResourceHandle } from "../../contracts/interfaces/IResourceHandle";
import type { IResourceKey } from "../../contracts/interfaces/IResourceKey";
import type { IResourceScope } from "../../contracts/interfaces/IResourceScope";
import { EnumResourceKind } from "../../contracts/enums/EnumResourceKind";

// 类型定义提升至 contracts/resource，此处 re-export 保持既有导入路径兼容
export type { IResourceScope } from "../../contracts/interfaces/IResourceScope";

export interface ResourceScopeRegistry {
    /** 创建共享同一全局引用计数与卸载判断的独立作用域。 */
    createScope(): IResourceScope;

    /** 查询某 Bundle 当前是否已无任何引用（可卸载），不依赖引擎全局状态。 */
    canUnload(bundle: string): boolean;
}

export interface ResourceScopeRegistryOptions {
    /**
     * 卸载执行器：某个 Bundle 从"仍有作用域持有"变为"无任何引用且无进行中加载"
     * 时调用一次。纯 TypeScript 侧只负责判定时机，真正执行 releaseAll/removeBundle
     * 由 Cocos Asset Bundle 适配器注入（参见 design.md 决策 3 的接缝）。
     */
    readonly unloadBundle: (bundle: string) => void;
    /**
     * 可选包级卸载执行器：FGUI package 键引用归零时调用一次（即使 bundle 仍被
     * 其它包持有，如共享 bundle 中的常驻通用包）。用于引擎侧包注册表移除；
     * 调用方（Provider）负责同步失效加载缓存使同 key 可重新加载。
     */
    readonly unloadPackage?: (bundle: string, path: string) => void;
}

interface CountedResource {
    count: number;
}

function serializeKey(key: IResourceKey): string {
    // 与 LoadCoordinator 相同的键序化，保证同资源键去重一致
    return JSON.stringify([key.kind, key.bundle, key.path]);
}

/**
 * 资源作用域注册表：维护每个底层资源/Bundle 的全局引用计数。某个 Bundle
 * 同时满足"已就绪资源引用全部归零"与"没有进行中的加载"时才允许卸载并触发
 * 卸载执行器；仍被其他作用域引用或仍在加载的 Bundle 不会提前卸载。
 */
export function createResourceScopeRegistry(options: ResourceScopeRegistryOptions): ResourceScopeRegistry {
    const counts = new Map<string, CountedResource>();
    const bundleKeys = new Map<string, Set<string>>();
    const pendingCounts = new Map<string, number>();

    function isBundleOwned(bundle: string): boolean {
        const hasReference = (bundleKeys.get(bundle)?.size ?? 0) > 0;
        const hasPending = (pendingCounts.get(bundle) ?? 0) > 0;
        return hasReference || hasPending;
    }

    function markPending(bundle: string): void {
        pendingCounts.set(bundle, (pendingCounts.get(bundle) ?? 0) + 1);
    }

    function clearPending(bundle: string): void {
        const next = (pendingCounts.get(bundle) ?? 1) - 1;

        if (next <= 0) {
            pendingCounts.delete(bundle);
        } else {
            pendingCounts.set(bundle, next);
        }
    }

    function markReferenced(key: IResourceKey): void {
        const keyId = serializeKey(key);
        const existing = counts.get(keyId);

        if (existing === undefined) {
            counts.set(keyId, { count: 1 });

            let keys = bundleKeys.get(key.bundle);
            if (keys === undefined) {
                keys = new Set();
                bundleKeys.set(key.bundle, keys);
            }
            keys.add(keyId);
        } else {
            existing.count += 1;
        }
    }

    function maybeUnloadIfNotOwned(bundle: string): unknown {
        if (isBundleOwned(bundle)) {
            return undefined;
        }

        try {
            options.unloadBundle(bundle);
            return undefined;
        } catch (error) {
            // 卸载执行器失败不阻断引用计数收敛；调用方（release）决定如何上报
            return error;
        }
    }

    function releaseReferenced(key: IResourceKey): unknown {
        const keyId = serializeKey(key);
        const entry = counts.get(keyId);

        if (entry === undefined) {
            return undefined;
        }

        entry.count -= 1;

        if (entry.count > 0) {
            return undefined;
        }

        counts.delete(keyId);

        const bundleKeysForBundle = bundleKeys.get(key.bundle);
        bundleKeysForBundle?.delete(keyId);

        if (bundleKeysForBundle !== undefined && bundleKeysForBundle.size === 0) {
            bundleKeys.delete(key.bundle);
        }

        // 包级卸载先于 bundle 级判定：FGUI package 引用归零即从引擎注册表移除，
        // 即使 bundle 仍被其它包持有（共享 bundle 场景）。卸载执行器失败被隔离，
        // 不阻断 bundle 级判定（与 maybeUnloadIfNotOwned 同语义）。
        let firstError: unknown = undefined;
        if (key.kind === EnumResourceKind.FairyGuiPackage) {
            try {
                options.unloadPackage?.(key.bundle, key.path);
            } catch (error) {
                firstError = error;
            }
        }

        const unloadError = maybeUnloadIfNotOwned(key.bundle);
        return firstError ?? unloadError;
    }

    function createScope(): IResourceScope {
        const held = new Map<string, { handle: IResourceHandle; counted: boolean; pending: boolean }>();
        let released = false;

        function settle(keyId: string, settled: IResourceHandle): void {
            if (released) {
                return;
            }

            const entry = held.get(keyId);

            if (entry === undefined) {
                return;
            }

            if (entry.pending) {
                entry.pending = false;
                clearPending(entry.handle.key.bundle);
            }

            if (!entry.counted && settled.state === "ready") {
                markReferenced(settled.key);
                entry.counted = true;
            }

            // 异步回调中的卸载失败无法向调用方可靠上报，这里隔离；Adapter 应自行防御引擎异常
            maybeUnloadIfNotOwned(entry.handle.key.bundle);
        }

        return {
            retain(handle) {
                // release 后作用域已不可用：忽略后续 retain，避免复活已释放作用域
                // 造成引用永不回落的泄漏
                if (released) {
                    return;
                }

                const keyId = serializeKey(handle.key);

                if (held.has(keyId)) {
                    return;
                }

                const entry = { handle, counted: false, pending: false };
                held.set(keyId, entry);

                if (handle.state === "loading") {
                    entry.pending = true;
                    markPending(handle.key.bundle);
                    handle.done.then((settled) => {
                        settle(keyId, settled);
                    });
                } else if (handle.state === "ready") {
                    markReferenced(handle.key);
                    entry.counted = true;
                }
                // failed / cancelled：持有但不计数、不占 pending，实现失败隔离
            },

            release() {
                if (released) {
                    return;
                }

                released = true;

                let firstError: unknown;

                // 按持有顺序逆序释放，对齐"逆序释放其自身持有项"的契约
                // Array.from 而非展开运算符：Creator 构建会把 `[...iterable]` 转译成
                // `[].concat(iterable)`，concat 不展开迭代器/Set 导致迭代得到迭代器本身，
                // 资源释放会静默失效。Array.from 转译后语义不变。
                for (const entry of Array.from(held.values()).reverse()) {
                    if (entry.counted) {
                        const error = releaseReferenced(entry.handle.key);

                        if (error !== undefined && firstError === undefined) {
                            firstError = error;
                        }
                    } else if (entry.pending) {
                        entry.pending = false;
                        clearPending(entry.handle.key.bundle);
                        entry.handle.cancel();

                        const error = maybeUnloadIfNotOwned(entry.handle.key.bundle);

                        if (error !== undefined && firstError === undefined) {
                            firstError = error;
                        }
                    }
                }

                held.clear();

                // 引用计数已全部收敛，再上报首个卸载失败，避免一次回调异常毁掉整个释放
                if (firstError !== undefined) {
                    throw firstError;
                }
            },
        };
    }

    return {
        createScope,
        canUnload(bundle: string) {
            return !isBundleOwned(bundle);
        },
    };
}
