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
   * Resolves with the handle itself once the load settles (ready or failed)
   * or the handle is cancelled. It never rejects; inspect `state` and
   * `error` instead of catching.
   */
  readonly done: Promise<ResourceHandle<T>>;
  /**
   * Detaches this waiter from the shared load. Idempotent and only effective
   * while the handle is still loading; other waiters are unaffected.
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
 * Engine-agnostic load coordinator. Requests for the same resource key share
 * a single underlying load: the first request starts the load and every
 * waiter is settled from the shared result. Cancelling a waiter only detaches
 * it from that shared load and never disturbs other waiters.
 *
 * Terminal entries are cached for the lifetime of the coordinator instance.
 * Eviction or invalidation (for reference-counted release or scene retry) is
 * intentionally not built here; see design.md decision 2 for the hand-off to
 * later phases.
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
      // Contract-boundary assertion: the caller-declared `T` must match what
      // the loader actually produces; the coordinator cannot verify it (the
      // same inherent trade-off as a typed `fetch<T>` wrapper).
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
