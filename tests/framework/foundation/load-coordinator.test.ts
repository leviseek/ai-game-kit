import { describe, expect, test } from "bun:test";

import {
  createLoadCoordinator,
  type LoadCoordinator,
  type ResourceHandle,
  type ResourceKey,
} from "../../../assets/framework/core/resource/LoadCoordinator";

interface ControlledDeferred {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
}

interface ControlledLoader {
  readonly calls: readonly ResourceKey[];
  readonly pending: readonly ControlledDeferred[];
  readonly loader: (key: ResourceKey) => Promise<unknown>;
}

function assetKey(path: string, bundle = "common"): ResourceKey {
  return { kind: "asset", bundle, path };
}

function createControlledLoader(): ControlledLoader {
  const calls: ResourceKey[] = [];
  const pending: ControlledDeferred[] = [];

  const loader = (key: ResourceKey): Promise<unknown> => {
    calls.push(key);
    return new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
    });
  };

  return { calls, pending, loader };
}

type ErrorWithCause = Error & { readonly cause?: unknown };

describe("LoadCoordinator concurrent deduplication", () => {
  test("two concurrent requests for the same resource trigger one underlying load", async () => {
    const { loader, calls, pending } = createControlledLoader();
    const coordinator: LoadCoordinator = createLoadCoordinator({ loader });

    const first: ResourceHandle = coordinator.load(assetKey("a.png"));
    const second: ResourceHandle = coordinator.load(assetKey("a.png"));

    expect(calls).toHaveLength(1);
    expect(first).not.toBe(second);

    const value = { id: "shared-asset" };
    pending[0].resolve(value);

    await expect(first.done).resolves.toBe(first);
    await expect(second.done).resolves.toBe(second);
    expect(first.state).toBe("ready");
    expect(second.state).toBe("ready");
    expect(first.resource).toBe(value);
    expect(second.resource).toBe(value);
  });

  test("distinct resources load independently", async () => {
    const { loader, calls, pending } = createControlledLoader();
    const coordinator = createLoadCoordinator({ loader });

    coordinator.load(assetKey("a.png"));
    coordinator.load(assetKey("b.png"));

    expect(calls).toHaveLength(2);
    expect(calls[0].path).toBe("a.png");
    expect(calls[1].path).toBe("b.png");
    expect(pending).toHaveLength(2);
  });
});

describe("LoadCoordinator failure propagation", () => {
  test("a failed load propagates the original cause and resource identity to all waiters", async () => {
    const { loader, pending } = createControlledLoader();
    const coordinator = createLoadCoordinator({ loader });
    const original = new Error("disk read failed");

    const first = coordinator.load(assetKey("missing.txt"));
    const second = coordinator.load(assetKey("missing.txt"));

    pending[0].reject(original);

    await expect(first.done).resolves.toBe(first);
    await expect(second.done).resolves.toBe(second);
    expect(first.state).toBe("failed");
    expect(second.state).toBe("failed");
    expect(first.error).toBe(second.error);

    const failure = first.error as ErrorWithCause;
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toMatch(/missing\.txt/);
    expect(failure.message).toMatch(/common/);
    expect(failure.cause).toBe(original);
  });

  test("waiters that join after the failure was reported also observe the failure", async () => {
    const { loader, pending } = createControlledLoader();
    const coordinator = createLoadCoordinator({ loader });
    const original = new Error("load failed once");

    const first = coordinator.load(assetKey("boom.txt"));
    pending[0].reject(original);
    await first.done;

    const late = coordinator.load(assetKey("boom.txt"));

    expect(late.state).toBe("failed");
    expect((late.error as ErrorWithCause).cause).toBe(original);
  });
});

describe("LoadCoordinator waiter cancellation", () => {
  test("cancelling one waiter does not stop other waiters from receiving the result", async () => {
    const { loader, calls, pending } = createControlledLoader();
    const coordinator = createLoadCoordinator({ loader });

    const cancelled = coordinator.load(assetKey("a.png"));
    const remaining = coordinator.load(assetKey("a.png"));

    cancelled.cancel();
    expect(cancelled.state).toBe("cancelled");
    expect(calls).toHaveLength(1);

    const value = { id: "kept" };
    pending[0].resolve(value);

    await remaining.done;
    expect(remaining.state).toBe("ready");
    expect(remaining.resource).toBe(value);
  });

  test("a cancelled waiter never receives the load result", async () => {
    const { loader, pending } = createControlledLoader();
    const coordinator = createLoadCoordinator({ loader });

    const cancelled = coordinator.load(assetKey("a.png"));
    cancelled.cancel();

    const value = { id: "fresh" };
    pending[0].resolve(value);
    await cancelled.done;

    expect(cancelled.state).toBe("cancelled");
    expect(cancelled.resource).toBeUndefined();
  });
});

describe("LoadCoordinator loader synchronous failure", () => {
  test("a loader that throws synchronously settles the entry as failed with cause and identity", async () => {
    const key = assetKey("sync-boom.txt");
    let calls = 0;
    const coordinator = createLoadCoordinator({
      loader: () => {
        calls += 1;
        throw new Error("sync boom");
      },
    });

    const first = coordinator.load(key);
    const second = coordinator.load(key);

    expect(first.state).toBe("failed");
    expect(second.state).toBe("failed");
    expect(first.error).toBe(second.error);

    const failure = first.error as ErrorWithCause;
    expect(failure.message).toMatch(/sync-boom\.txt/);
    expect(failure.message).toMatch(/common/);
    expect((failure.cause as Error).message).toBe("sync boom");
    expect(calls).toBe(1);
  });
});

describe("LoadCoordinator late waiter after terminal state", () => {
  test("waiters that join after success also observe the ready result", async () => {
    const { loader, pending } = createControlledLoader();
    const coordinator = createLoadCoordinator({ loader });

    const first = coordinator.load(assetKey("a.png"));
    const value = { id: "cached" };
    pending[0].resolve(value);
    await first.done;

    const late = coordinator.load(assetKey("a.png"));

    expect(late.state).toBe("ready");
    expect(late.resource).toBe(value);
  });
});

describe("LoadCoordinator shared underlying resource", () => {
  test("requests from different callers share the same underlying load result", async () => {
    const { loader, calls, pending } = createControlledLoader();
    const coordinator = createLoadCoordinator({ loader });

    const callerA = coordinator.load(assetKey("textures/hero.png"));
    const callerB = coordinator.load(assetKey("textures/hero.png"));

    expect(calls).toHaveLength(1);

    const value = { id: "one-instance" };
    pending[0].resolve(value);

    await callerA.done;
    await callerB.done;

    expect(callerA.resource).toBe(value);
    expect(callerB.resource).toBe(value);
    expect(callerA.resource).toBe(callerB.resource);
  });

  test("a failure is shared identically across callers, not re-thrown per request", async () => {
    const { loader, pending } = createControlledLoader();
    const coordinator = createLoadCoordinator({ loader });
    const original = new Error("asset corrupt");

    const callerA = coordinator.load(assetKey("ui/main.png"));
    const callerB = coordinator.load(assetKey("ui/main.png"));

    pending[0].reject(original);

    await callerA.done;
    await callerB.done;

    expect(callerA.error).toBe(callerB.error);
    expect((callerA.error as ErrorWithCause).cause).toBe(original);
  });
});
