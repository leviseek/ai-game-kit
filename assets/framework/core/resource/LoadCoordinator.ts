import { FrameworkError } from "../errors/FrameworkError";

export type ResourceKind = "asset" | "fairygui-package";

export interface ResourceKey {
  readonly kind: ResourceKind;
  readonly bundle: string;
  readonly path: string;
}

export type ResourceLoadState = "loading" | "ready" | "failed" | "cancelled";

export interface ResourceHandle<T = unknown> {
  readonly key: ResourceKey;
  readonly state: ResourceLoadState;
  readonly resource: T | undefined;
  readonly error: unknown;
  /**
   * 加载落定（ready/failed）或 handle 被取消后，以 handle 自身 resolve。
   * 从不 reject；读取 `state` 与 `error` 判断结果，不要使用 try/catch。
   */
  readonly done: Promise<ResourceHandle<T>>;
  /**
   * 将该等待者从共享加载中分离（detach）。幂等（idempotent），仅在 handle
   * 仍处于 loading 时生效；不影响其他等待者。
   */
  cancel(): void;
}

export interface LoadCoordinatorOptions {
  readonly loader: (key: ResourceKey) => Promise<unknown>;
}

export interface LoadCoordinator {
  load<T = unknown>(key: ResourceKey): ResourceHandle<T>;
}

interface LoadEntry {
  readonly key: ResourceKey;
  readonly keyId: string;
  readonly waiters: Set<() => void>;
  state: "loading" | "ready" | "failed";
  resource: unknown;
  error: unknown;
}

function serializeKey(key: ResourceKey): string {
  return JSON.stringify([key.kind, key.bundle, key.path]);
}

function createLoadFailure(key: ResourceKey, cause: unknown): unknown {
  return new FrameworkError(
    `Failed to load resource "${key.bundle}:${key.path}" (kind=${key.kind})`,
    { cause, moduleId: "resource", component: "load-coordinator" },
  );
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
export function createLoadCoordinator(
  options: LoadCoordinatorOptions,
): LoadCoordinator {
  const entries = new Map<string, LoadEntry>();

  function settleEntry(
    entry: LoadEntry,
    nextState: "ready" | "failed",
    value: unknown,
    error: unknown,
  ): void {
    if (entry.state !== "loading") {
      return;
    }

    entry.state = nextState;
    entry.resource = value;
    entry.error = error;

    const waiters = [...entry.waiters];
    entry.waiters.clear();
    for (const finish of waiters) {
      finish();
    }
  }

  function createHandle<T>(
    key: ResourceKey,
    entry: LoadEntry,
  ): ResourceHandle<T> {
    let state: ResourceLoadState = "loading";
    let resource: T | undefined;
    let error: unknown;
    let resolveDone: ((handle: ResourceHandle<T>) => void) | undefined;
    const done = new Promise<ResourceHandle<T>>((resolve) => {
      resolveDone = resolve;
    });

    const finish = (): void => {
      if (state !== "loading") {
        return;
      }

      state = entry.state;
      // 契约边界断言：调用方声明的 `T` 必须与 loader 实际产出一致，协调器无法验证
      // （与类型化 `fetch<T>` 包装相同的固有权衡）。
      resource = entry.resource as T;
      error = entry.error;
      resolveDone?.(handle);
    };

    const handle: ResourceHandle<T> = {
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
        if (state !== "loading") {
          return;
        }

        state = "cancelled";
        entry.waiters.delete(finish);
        resolveDone?.(handle);
      },
    };

    if (entry.state === "loading") {
      entry.waiters.add(finish);
    } else {
      finish();
    }

    return handle;
  }

  function load<T = unknown>(key: ResourceKey): ResourceHandle<T> {
    const keyId = serializeKey(key);
    let entry = entries.get(keyId);

    if (entry === undefined) {
      const created: LoadEntry = {
        key,
        keyId,
        waiters: new Set(),
        state: "loading",
        resource: undefined,
        error: undefined,
      };
      entries.set(keyId, created);

      let loadPromise: Promise<unknown>;
      try {
        loadPromise = options.loader(key);
      } catch (error) {
        settleEntry(created, "failed", undefined, createLoadFailure(key, error));
        return createHandle<T>(key, created);
      }

      loadPromise.then(
        (value) => settleEntry(created, "ready", value, undefined),
        (reason: unknown) =>
          settleEntry(
            created,
            "failed",
            undefined,
            createLoadFailure(key, reason),
          ),
      );

      entry = created;
    }

    return createHandle<T>(key, entry);
  }

  return { load };
}
