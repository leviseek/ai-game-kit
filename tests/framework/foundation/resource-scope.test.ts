import { describe, expect, test } from "bun:test";

import {
  createLoadCoordinator,
  type ResourceHandle,
  type ResourceKey,
} from "../../../assets/framework/core/resource/LoadCoordinator";
import {
  createResourceScopeRegistry,
  type ResourceScope,
  type ResourceScopeRegistry,
} from "../../../assets/framework/core/resource/ResourceScope";

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

interface RegistrySpy {
  readonly registry: ResourceScopeRegistry;
  readonly unloaded: readonly string[];
}

function createRegistrySpy(): RegistrySpy {
  const unloaded: string[] = [];
  const registry = createResourceScopeRegistry({
    unloadBundle: (bundle: string) => {
      unloaded.push(bundle);
    },
  });
  return { registry, unloaded };
}

async function settleReady<T>(
  coordinator: ReturnType<typeof createLoadCoordinator>,
  pending: readonly ControlledDeferred[],
  key: ResourceKey,
): Promise<ResourceHandle<T>> {
  const index = pending.length;
  const handle = coordinator.load<T>(key);
  pending[index].resolve({ id: "loaded" });
  await handle.done;
  return handle;
}

describe("ResourceScope reverse-order release across independent scopes", () => {
  test("releasing independent scopes inner-to-outer only releases each scope's own holdings", async () => {
    const { loader, pending } = createControlledLoader();
    const coordinator = createLoadCoordinator({ loader });
    const { registry, unloaded } = createRegistrySpy();

    const page = registry.createScope();
    const scene = registry.createScope();
    const app = registry.createScope();

    const pageRes = await settleReady(
      coordinator,
      pending,
      assetKey("ui/main.png", "ui"),
    );
    const sceneRes = await settleReady(
      coordinator,
      pending,
      assetKey("config.json"),
    );
    const appRes = await settleReady(
      coordinator,
      pending,
      assetKey("audio/bgm.mp3", "audio"),
    );

    page.retain(pageRes);
    scene.retain(sceneRes);
    app.retain(appRes);

    page.release();
    expect(unloaded).toEqual(["ui"]);
    expect(registry.canUnload("ui")).toBe(true);
    expect(registry.canUnload("common")).toBe(false);
    expect(registry.canUnload("audio")).toBe(false);

    scene.release();
    expect(unloaded).toEqual(["ui", "common"]);
    expect(registry.canUnload("common")).toBe(true);
    expect(registry.canUnload("audio")).toBe(false);

    app.release();
    expect(unloaded).toEqual(["ui", "common", "audio"]);
    expect(registry.canUnload("audio")).toBe(true);
  });
});

describe("ResourceScope shared ownership", () => {
  test("a resource still referenced by another scope is preserved when one scope releases", async () => {
    const { loader, pending } = createControlledLoader();
    const coordinator = createLoadCoordinator({ loader });
    const { registry, unloaded } = createRegistrySpy();

    const scene = registry.createScope();
    const app = registry.createScope();
    const handle = await settleReady(
      coordinator,
      pending,
      assetKey("config/start.json"),
    );

    scene.retain(handle);
    app.retain(handle);

    scene.release();
    expect(registry.canUnload("common")).toBe(false);
    expect(unloaded).toEqual([]);

    app.release();
    expect(registry.canUnload("common")).toBe(true);
    expect(unloaded).toEqual(["common"]);
  });

  test("two scopes sharing the same underlying load each contribute one reference", async () => {
    const { loader, calls, pending } = createControlledLoader();
    const coordinator = createLoadCoordinator({ loader });
    const { registry, unloaded } = createRegistrySpy();

    const first = registry.createScope();
    const second = registry.createScope();
    const shared = assetKey("textures/hero.png");

    const firstHandle = coordinator.load(shared);
    const secondHandle = coordinator.load(shared);
    expect(calls).toHaveLength(1);

    pending[0].resolve({});
    await firstHandle.done;
    await secondHandle.done;

    first.retain(firstHandle);
    second.retain(secondHandle);

    first.release();
    expect(registry.canUnload("common")).toBe(false);
    expect(unloaded).toEqual([]);

    second.release();
    expect(registry.canUnload("common")).toBe(true);
    expect(unloaded).toEqual(["common"]);
  });
});

describe("ResourceScope unload judgment", () => {
  test("canUnload reflects current ownership without consulting engine state", async () => {
    const { loader, pending } = createControlledLoader();
    const coordinator = createLoadCoordinator({ loader });
    const { registry, unloaded } = createRegistrySpy();
    const scope = registry.createScope();

    expect(registry.canUnload("common")).toBe(true);

    const handle = await settleReady(
      coordinator,
      pending,
      assetKey("config.json"),
    );
    scope.retain(handle);

    expect(registry.canUnload("common")).toBe(false);

    scope.release();
    expect(registry.canUnload("common")).toBe(true);
    expect(unloaded).toEqual(["common"]);
  });

  test("unload fires exactly once when the last reference across all scopes drops", async () => {
    const { loader, pending } = createControlledLoader();
    const coordinator = createLoadCoordinator({ loader });
    const { registry, unloaded } = createRegistrySpy();

    const page = registry.createScope();
    const app = registry.createScope();
    const handle = await settleReady(
      coordinator,
      pending,
      assetKey("config.json"),
    );

    page.retain(handle);
    app.retain(handle);

    page.release();
    app.release();

    expect(unloaded).toEqual(["common"]);
    expect(registry.canUnload("common")).toBe(true);
  });
});

describe("ResourceScope idempotent release", () => {
  test("releasing the same scope twice is a no-op", async () => {
    const { loader, pending } = createControlledLoader();
    const coordinator = createLoadCoordinator({ loader });
    const { registry, unloaded } = createRegistrySpy();
    const scope = registry.createScope();

    const handle = await settleReady(
      coordinator,
      pending,
      assetKey("config.json"),
    );
    scope.retain(handle);

    scope.release();
    scope.release();

    expect(registry.canUnload("common")).toBe(true);
    expect(unloaded).toEqual(["common"]);
  });
});

describe("ResourceScope in-flight cancellation during release", () => {
  test("releasing a scope cancels its in-flight load without breaking other waiters", async () => {
    const { loader, calls, pending } = createControlledLoader();
    const coordinator = createLoadCoordinator({ loader });
    const { registry, unloaded } = createRegistrySpy();

    const left = registry.createScope();
    const right = registry.createScope();

    const leftHandle = coordinator.load(assetKey("a.png"));
    const rightHandle = coordinator.load(assetKey("a.png"));
    expect(calls).toHaveLength(1);

    left.retain(leftHandle);
    right.retain(rightHandle);

    left.release();
    expect(leftHandle.state).toBe("cancelled");
    expect(registry.canUnload("common")).toBe(false);

    pending[0].resolve({ id: "kept" });
    await rightHandle.done;
    expect(rightHandle.state).toBe("ready");

    right.release();
    expect(registry.canUnload("common")).toBe(true);
    expect(unloaded).toEqual(["common"]);
  });

  test("a loading handle retained by a scope counts once it becomes ready", async () => {
    const { loader, pending } = createControlledLoader();
    const coordinator = createLoadCoordinator({ loader });
    const { registry, unloaded } = createRegistrySpy();
    const scope = registry.createScope();

    const handle = coordinator.load(assetKey("config.json"));
    scope.retain(handle);

    // 加载进行中：Bundle 仍有作用域持有（进行中的加载），不可卸载
    expect(registry.canUnload("common")).toBe(false);

    pending[0].resolve({ id: "cfg" });
    await handle.done;

    expect(registry.canUnload("common")).toBe(false);

    scope.release();
    expect(registry.canUnload("common")).toBe(true);
    expect(unloaded).toEqual(["common"]);
  });
});

describe("ResourceScope ownership transfer", () => {
  test("transferring ownership retains in the target before releasing the source, never zeroing references or triggering unload", async () => {
    const { loader, pending } = createControlledLoader();
    const coordinator = createLoadCoordinator({ loader });
    const { registry, unloaded } = createRegistrySpy();

    const source = registry.createScope();
    const target = registry.createScope();
    const handle = await settleReady(
      coordinator,
      pending,
      assetKey("config.json"),
    );

    source.retain(handle);

    // 转移顺序：目标作用域先增持，来源作用域后释放
    target.retain(handle);
    expect(registry.canUnload("common")).toBe(false);
    expect(unloaded).toEqual([]);

    source.release();
    expect(registry.canUnload("common")).toBe(false);
    expect(unloaded).toEqual([]);

    target.release();
    expect(registry.canUnload("common")).toBe(true);
    expect(unloaded).toEqual(["common"]);
  });
});

describe("ResourceScope failure isolation", () => {
  test("a failed resource does not affect the scope's other holdings or unload judgment", async () => {
    const { loader, pending } = createControlledLoader();
    const coordinator = createLoadCoordinator({ loader });
    const { registry, unloaded } = createRegistrySpy();
    const scope = registry.createScope();

    const good = coordinator.load(assetKey("config.json"));
    const bad = coordinator.load(assetKey("missing.json", "audio"));

    pending[0].resolve({ id: "cfg" });
    pending[1].reject(new Error("missing"));
    await good.done;
    await bad.done;
    expect(bad.state).toBe("failed");

    scope.retain(good);
    scope.retain(bad);

    scope.release();
    // 失败资源从不计数、不触发卸载；只有 good 的引用被释放
    expect(unloaded).toEqual(["common"]);
    expect(registry.canUnload("audio")).toBe(true);
  });

  test("retaining the same resource twice in one scope counts once", async () => {
    const { loader, pending } = createControlledLoader();
    const coordinator = createLoadCoordinator({ loader });
    const { registry, unloaded } = createRegistrySpy();
    const scope = registry.createScope();

    const handle = await settleReady(
      coordinator,
      pending,
      assetKey("config.json"),
    );

    scope.retain(handle);
    scope.retain(handle);

    scope.release();
    expect(unloaded).toEqual(["common"]);
    expect(registry.canUnload("common")).toBe(true);
  });
});
