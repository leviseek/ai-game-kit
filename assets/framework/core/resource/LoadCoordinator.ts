import { FrameworkError } from "../errors/FrameworkError";
import type { IResourceHandle } from "../../contracts/interfaces/IResourceHandle";
import type { IResourceKey } from "../../contracts/interfaces/IResourceKey";

import { EnumResourceLoadState } from "../../contracts/enums/EnumResourceLoadState";

// 类型定义提升至 contracts，此处 re-export 保持既有导入路径兼容
export type { IResourceHandle } from "../../contracts/interfaces/IResourceHandle";
export type { IResourceKey } from "../../contracts/interfaces/IResourceKey";
export type { EnumResourceKind } from "../../contracts/enums/EnumResourceKind";
export type { EnumResourceLoadState } from "../../contracts/enums/EnumResourceLoadState";

export interface LoadCoordinatorOptions {
    readonly loader: (key: IResourceKey) => Promise<unknown>;
}

export interface LoadCoordinator {
    load<T = unknown>(key: IResourceKey): IResourceHandle<T>;

    /**
     * 使某资源键的终态缓存（ready/failed）失效，下次 load 触发新的底层加载。
     * loading 中的 entry 不做驱逐，避免破坏并发去重共享语义；未知 key 为 no-op。
     */
    invalidate(key: IResourceKey): void;
}

interface LoadEntry {
    readonly key: IResourceKey;
    readonly keyId: string;
    readonly waiters: Set<() => void>;
    state: EnumResourceLoadState.Loading | EnumResourceLoadState.Ready | EnumResourceLoadState.Failed;
    resource: unknown;
    error: unknown;
}

function serializeKey(key: IResourceKey): string {
    return JSON.stringify([key.kind, key.bundle, key.path]);
}

function createLoadFailure(key: IResourceKey, cause: unknown): unknown {
    return new FrameworkError(`Failed to load resource "${key.bundle}:${key.path}" (kind=${key.kind})`, { cause, moduleId: "resource", component: "load-coordinator" });
}

/**
 * 引擎无关的加载协调器。同一资源键的请求共享一次底层加载：首个请求触发加载，
 * 所有等待者从共享结果中落定。取消某个等待者只会把它从共享加载中分离，
 * 绝不干扰其他等待者。
 *
 * 终态 entry（ready/failed）在协调器实例生命周期内缓存；为引用计数释放或场景重试
 * 提供的驱逐（eviction）与失效（invalidation）有意不在此实现，交接给后续阶段，
 * 参见 design.md 决策 2。
 */
export function createLoadCoordinator(options: LoadCoordinatorOptions): LoadCoordinator {
    const entries = new Map<string, LoadEntry>();

    function settleEntry(entry: LoadEntry, nextState: EnumResourceLoadState.Ready | EnumResourceLoadState.Failed, value: unknown, error: unknown): void {
        if (entry.state !== EnumResourceLoadState.Loading) {
            return;
        }

        entry.state = nextState;
        entry.resource = value;
        entry.error = error;

        // Array.from 而非展开运算符：Creator 构建会把 `[...set]` 转译成
        // `[].concat(set)`，concat 不展开 Set 导致迭代得到 Set 对象本身，
        // finish() 报 "finish is not a function"。Array.from 转译后语义不变。
        const waiters = Array.from(entry.waiters);
        entry.waiters.clear();
        for (const finish of waiters) {
            finish();
        }
    }

    function createHandle<T>(key: IResourceKey, entry: LoadEntry): IResourceHandle<T> {
        let state: EnumResourceLoadState = EnumResourceLoadState.Loading;
        let resource: T | undefined;
        let error: unknown;
        let resolveDone: ((handle: IResourceHandle<T>) => void) | undefined;
        const done = new Promise<IResourceHandle<T>>((resolve) => {
            resolveDone = resolve;
        });

        const finish = (): void => {
            if (state !== EnumResourceLoadState.Loading) {
                return;
            }

            state = entry.state;
            // 契约边界断言：调用方声明的 `T` 必须与 loader 实际产出一致，协调器无法验证
            // （与类型化 `fetch<T>` 包装相同的固有权衡）。
            resource = entry.resource as T;
            error = entry.error;
            resolveDone?.(handle);
        };

        const handle: IResourceHandle<T> = {
            key,
            get state() {
                return state;
            },
            get resource() {
                return resource;
            },
            get error() {
                return error;
            },
            done,
            cancel() {
                if (state !== EnumResourceLoadState.Loading) {
                    return;
                }

                state = EnumResourceLoadState.Cancelled;
                entry.waiters.delete(finish);
                resolveDone?.(handle);
            },
        };

        if (entry.state === EnumResourceLoadState.Loading) {
            entry.waiters.add(finish);
        } else {
            finish();
        }

        return handle;
    }

    function load<T = unknown>(key: IResourceKey): IResourceHandle<T> {
        const keyId = serializeKey(key);
        let entry = entries.get(keyId);

        if (entry === undefined) {
            const created: LoadEntry = {
                key,
                keyId,
                waiters: new Set(),
                state: EnumResourceLoadState.Loading,
                resource: undefined,
                error: undefined,
            };
            entries.set(keyId, created);

            let loadPromise: Promise<unknown>;
            try {
                loadPromise = options.loader(key);
            } catch (error) {
                settleEntry(created, EnumResourceLoadState.Failed, undefined, createLoadFailure(key, error));
                return createHandle<T>(key, created);
            }

            loadPromise.then(
                (value) => settleEntry(created, EnumResourceLoadState.Ready, value, undefined),
                (reason: unknown) => settleEntry(created, EnumResourceLoadState.Failed, undefined, createLoadFailure(key, reason)),
            );

            entry = created;
        }

        return createHandle<T>(key, entry);
    }

    function invalidate(key: IResourceKey): void {
        const entry = entries.get(serializeKey(key));

        // 只驱逐终态 entry；loading 中的共享加载继续由已有等待者持有
        if (entry !== undefined && entry.state !== EnumResourceLoadState.Loading) {
            entries.delete(serializeKey(key));
        }
    }

    return { load, invalidate };
}
