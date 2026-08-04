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
  readonly done: Promise<ResourceHandle<T>>;
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
  return `${key.kind}:${key.bundle}:${key.path}`;
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

      options.loader(key).then(
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
