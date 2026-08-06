import { describe, expect, mock, test } from "bun:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// 以平台存储适配器为后端运行 versioned-storage 仓库行为：确认仓库写入经适配器
// 原子替换/备份策略落盘、读取可经新适配器实例持久化一致，且既有仓库语义
//（命名空间隔离、schema version、迁移、未来版本拒绝、DTO 校验、损坏诊断）不回归。
mock.module("cc", () => ({
  sys: {
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
  },
}));

import {
  SaveCorruptionError,
  SaveMigrationError,
  SaveSerializationError,
  SaveVersionError,
  createVersionedStorage,
} from "../../../assets/framework/core/storage/VersionedStorage";
import type {
  SaveMigrator,
  SaveVersion,
  VersionedStorage,
} from "../../../assets/framework/contracts/storage/VersionedStorage";
import type { PlatformStorage } from "../../../assets/framework/contracts/platform/Platform";

const projectRoot = resolve(import.meta.dir, "../../..");
const adapterFile = resolve(
  projectRoot,
  "assets/framework/adapters/cocos/storage/CocosStorageAdapter.ts",
);

interface LocalStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type CreateCocosStorageAdapter = (options?: {
  readonly localStorage?: LocalStorageLike;
}) => PlatformStorage;

async function loadCreateAdapter(): Promise<CreateCocosStorageAdapter> {
  const exports = (await import(
    pathToFileURL(adapterFile).href,
  )) as { createCocosStorageAdapter: CreateCocosStorageAdapter };

  expect(typeof exports.createCocosStorageAdapter).toBe("function");

  return exports.createCocosStorageAdapter;
}

// 平台后端：内存 localStorage，跨适配器实例共享同一持久化
interface BackendHarness {
  readonly backend: () => PlatformStorage;
  readonly platform: () => LocalStorageLike & {
    readonly entries: () => Readonly<Record<string, string>>;
  };
}

async function createBackendHarness(): Promise<BackendHarness> {
  const createAdapter = await loadCreateAdapter();
  const store = new Map<string, string>();

  const platform: LocalStorageLike & {
    readonly entries: () => Readonly<Record<string, string>>;
  } = {
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
    entries() {
      return Object.fromEntries(store);
    },
  };

  return {
    backend: () => createAdapter({ localStorage: platform }),
    platform: () => platform,
  };
}

function createRepository(
  backend: PlatformStorage,
  currentVersion: SaveVersion,
  migrators?: Readonly<Record<SaveVersion, SaveMigrator>>,
): VersionedStorage {
  return createVersionedStorage({ storage: backend, currentVersion, migrators });
}

describe("VersionedStorage over the platform storage adapter", () => {
  test("saves and loads through the adapter with namespace isolation", async () => {
    const harness = await createBackendHarness();
    const storage = createRepository(harness.backend(), 1);

    await storage.save("player-a", "save", { name: "alice", level: 1 });
    await storage.save("player-b", "save", { name: "bob", level: 2 });

    expect(await storage.load("player-a", "save")).toEqual({
      version: 1,
      data: { name: "alice", level: 1 },
    });
    expect(await storage.load("player-b", "save")).toEqual({
      version: 1,
      data: { name: "bob", level: 2 },
    });
  });

  test("deleting one namespace leaves the other intact through the adapter", async () => {
    const harness = await createBackendHarness();
    const storage = createRepository(harness.backend(), 1);

    await storage.save("player-a", "save", { name: "alice" });
    await storage.save("player-b", "save", { name: "bob" });

    await storage.delete("player-a", "save");

    expect(await storage.load("player-a", "save")).toBeNull();
    expect(await storage.load("player-b", "save")).toEqual({
      version: 1,
      data: { name: "bob" },
    });
  });

  test("persisted records survive a new adapter instance over the same platform", async () => {
    const harness = await createBackendHarness();
    const writer = createRepository(harness.backend(), 1);

    await writer.save("player", "save", { name: "alice", level: 1 });

    // 新适配器实例 + 新仓库实例，读取同一平台后端
    const reader = createRepository(harness.backend(), 1);
    expect(await reader.load("player", "save")).toEqual({
      version: 1,
      data: { name: "alice", level: 1 },
    });
  });

  test("a written save records its schema version through the adapter", async () => {
    const harness = await createBackendHarness();
    const storage = createRepository(harness.backend(), 3);

    await storage.save("player", "save", { name: "alice", level: 1 });

    expect(await storage.load("player", "save")).toEqual({
      version: 3,
      data: { name: "alice", level: 1 },
    });
  });

  test("a legacy save migrates forward through the adapter", async () => {
    const harness = await createBackendHarness();
    const backend = harness.backend();
    const legacy = createRepository(backend, 1);
    await legacy.save("player", "save", { name: "alice", level: 1 });

    const storage = createRepository(backend, 3, {
      1: (data) => ({ ...(data as object), migratedTo: 2 }),
      2: (data) => ({ ...(data as object), migratedTo: 3 }),
    });

    expect(await storage.load("player", "save")).toEqual({
      version: 3,
      data: { name: "alice", level: 1, migratedTo: 3 },
    });
  });

  test("a missing migration step fails with a typed error through the adapter", async () => {
    const harness = await createBackendHarness();
    const backend = harness.backend();
    const legacy = createRepository(backend, 2);
    await legacy.save("player", "save", { name: "alice" });

    const storage = createRepository(backend, 3, { 1: (data) => data });

    expect(() => storage.load("player", "save")).toThrow(SaveMigrationError);
  });

  test("a future version is rejected with a typed error through the adapter", async () => {
    const harness = await createBackendHarness();
    const backend = harness.backend();
    const future = createRepository(backend, 5);
    await future.save("player", "future", { name: "alice" });

    const storage = createRepository(backend, 3);

    try {
      await storage.load("player", "future");
      expect.unreachable("load should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SaveVersionError);
      const versionError = error as SaveVersionError;
      expect(versionError.recordVersion).toBe(5);
      expect(versionError.currentVersion).toBe(3);
    }
  });

  test("a DTO with a non-serializable member is rejected before any write", async () => {
    const harness = await createBackendHarness();
    const storage = createRepository(harness.backend(), 1);

    expect(() =>
      storage.save("player", "save", { name: "alice", fn: () => {} }),
    ).toThrow(SaveSerializationError);

    expect(await storage.load("player", "save")).toBeNull();
  });

  test("a corrupted platform record surfaces as a typed error", async () => {
    const harness = await createBackendHarness();
    const backend = harness.backend();
    const storage = createRepository(backend, 3);

    // 直接向平台后端写入损坏数据（模拟平台层记录损坏）
    harness.platform().setItem("save:player:save", "not-json{{");

    expect(() => storage.load("player", "save")).toThrow(SaveCorruptionError);
  });

  test("a corrupted record in one namespace does not affect another namespace", async () => {
    const harness = await createBackendHarness();
    const backend = harness.backend();
    const storage = createRepository(backend, 3);

    await storage.save("player", "save", { name: "alice" });
    await storage.save("system", "settings", { theme: "dark" });
    harness.platform().setItem("save:player:save", "corrupted!{{");

    expect(() => storage.load("player", "save")).toThrow(SaveCorruptionError);
    expect(await storage.load("system", "settings")).toEqual({
      version: 3,
      data: { theme: "dark" },
    });
  });

  test("a separator inside namespace or key does not collide through the adapter", async () => {
    const harness = await createBackendHarness();
    const storage = createRepository(harness.backend(), 1);

    await storage.save("a:b", "c", { name: "first" });
    await storage.save("a", "b:c", { name: "second" });

    expect(await storage.load("a:b", "c")).toEqual({
      version: 1,
      data: { name: "first" },
    });
    expect(await storage.load("a", "b:c")).toEqual({
      version: 1,
      data: { name: "second" },
    });
  });
});
