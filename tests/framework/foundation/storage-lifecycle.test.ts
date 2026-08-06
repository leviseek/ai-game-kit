import { describe, expect, mock, test } from "bun:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// 生命周期保存收敛集成测试：mock cc 后动态加载适配器。
// 行为断言经注入的 localStorage 接缝，不依赖 cc 缺省成员。
mock.module("cc", () => ({
  sys: {
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
  },
}));

import { MemoryPlatform } from "../../../assets/framework/adapters/memory/MemoryPlatform";
import { SaveCorruptionError, createVersionedStorage } from "../../../assets/framework/core/storage/VersionedStorage";
import type { ApplicationVisibility } from "../../../assets/framework/contracts/platform/Platform";

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
}) => import("../../../assets/framework/contracts/platform/Platform").PlatformStorage;

interface CocosStorageAdapterExports {
  readonly createCocosStorageAdapter: CreateCocosStorageAdapter;
}

async function loadCreateAdapter(): Promise<CreateCocosStorageAdapter> {
  const exports = (await import(
    pathToFileURL(adapterFile).href,
  )) as CocosStorageAdapterExports;

  expect(typeof exports.createCocosStorageAdapter).toBe("function");

  return exports.createCocosStorageAdapter;
}

function createInspectableLocalStorage(): LocalStorageLike & {
  readonly entries: () => Readonly<Record<string, string>>;
} {
  const store = new Map<string, string>();

  return {
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
}

async function flush(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 0));
  await new Promise<void>((r) => setTimeout(r, 0));
}

// 生命周期保存协调器契约（实现于 core/storage/SaveCoordinator）：
// 订阅 ApplicationVisibility，在触发状态变化时调用 save()，并保证同一命名空间
// 写入串行化、同一窗口内多次触发合并到最后一次有效状态。
interface SaveCoordinator {
  start(): void;
  dispose(): void;
}

interface SaveCoordinatorExports {
  readonly createSaveCoordinator: (options: {
    readonly visibility: ApplicationVisibility;
    readonly triggerStates?: readonly ("foreground" | "background")[];
    readonly save: () => Promise<void>;
    readonly onError?: (error: unknown) => void;
  }) => SaveCoordinator;
}

async function loadCreateCoordinator(): Promise<SaveCoordinatorExports["createSaveCoordinator"]> {
  const coordinatorFile = resolve(
    projectRoot,
    "assets/framework/core/storage/SaveCoordinator.ts",
  );
  const exports = (await import(
    pathToFileURL(coordinatorFile).href,
  )) as SaveCoordinatorExports;

  expect(typeof exports.createSaveCoordinator).toBe("function");

  return exports.createSaveCoordinator;
}

describe("存档生命周期保存收敛（7.6）", () => {
  test("暂停/恢复/退出触发连续保存，最终持久化最后一次有效状态", async () => {
    const createAdapter = await loadCreateAdapter();
    const createCoordinator = await loadCreateCoordinator();

    const visibility = new MemoryPlatform();
    const adapter = createAdapter({
      localStorage: createInspectableLocalStorage(),
    });
    const storage = createVersionedStorage({
      storage: adapter,
      currentVersion: 1,
    });

    let state = { step: 0 };
    const coordinator = createCoordinator({
      visibility,
      triggerStates: ["background", "foreground"],
      save: async () => {
        await storage.save("player", "save", state);
      },
    });
    coordinator.start();

    // 暂停（background）、恢复（foreground）、退出（background）各触发一次保存，
    // 每次保存内容不同，触发之间不等待，模拟生命周期事件密集到达
    state = { step: 1 };
    visibility.setVisibility("background");

    state = { step: 2 };
    visibility.setVisibility("foreground");

    state = { step: 3 };
    visibility.setVisibility("background");

    await flush();
    coordinator.dispose();

    // 最终持久化的存档为最后一次有效保存的内容，记录有效且可读取
    const result = await storage.load("player", "save");
    expect(result).toEqual({ version: 1, data: { step: 3 } });
  });

  test("重复生命周期事件不会产生并发覆盖或交错损坏", async () => {
    const createAdapter = await loadCreateAdapter();
    const createCoordinator = await loadCreateCoordinator();

    const visibility = new MemoryPlatform();
    const adapter = createAdapter({
      localStorage: createInspectableLocalStorage(),
    });
    const storage = createVersionedStorage({
      storage: adapter,
      currentVersion: 1,
    });

    let state = { step: 0 };
    const coordinator = createCoordinator({
      visibility,
      triggerStates: ["background", "foreground"],
      save: async () => {
        await storage.save("player", "save", state);
      },
    });
    coordinator.start();

    // 连续高频切换可见性，逐步推进状态；期间任意时刻读取都不应读到半写入内容
    for (let i = 1; i <= 8; i += 1) {
      state = { step: i };
      visibility.setVisibility(i % 2 === 0 ? "foreground" : "background");

      // 生命周期事件密集期间读取：load 必须不抛损坏错误，且读到完整记录。
      // 不允许 catch 吞错放行——交错损坏会在此直接失败。
      const snapshot = await storage.load("player", "save");
      expect(snapshot).not.toBeNull();
      expect(snapshot?.version).toBe(1);
      expect(typeof snapshot?.data).toBe("object");
    }

    await flush();
    coordinator.dispose();

    // 生命周期结束后最后一次有效状态可完整读取
    const final = await storage.load("player", "save");
    expect(final?.version).toBe(1);
    expect(final?.data).toEqual({ step: 8 });
  });

  test("写入经平台存储适配器持久化，新适配器实例可读取一致内容", async () => {
    const createAdapter = await loadCreateAdapter();
    const createCoordinator = await loadCreateCoordinator();

    const backend = createInspectableLocalStorage();
    const visibility = new MemoryPlatform();
    const writerStorage = createVersionedStorage({
      storage: createAdapter({ localStorage: backend }),
      currentVersion: 1,
    });

    let state = { score: 10 };
    const coordinator = createCoordinator({
      visibility,
      save: async () => {
        await writerStorage.save("player", "save", state);
      },
    });
    coordinator.start();

    state = { score: 42 };
    visibility.setVisibility("background");
    await flush();
    coordinator.dispose();

    // 以新适配器实例为后端读取：存档经平台后端持久化，内容一致
    const readerStorage = createVersionedStorage({
      storage: createAdapter({ localStorage: backend }),
      currentVersion: 1,
    });
    expect(await readerStorage.load("player", "save")).toEqual({
      version: 1,
      data: { score: 42 },
    });
  });

  test("存档读取到损坏记录时以类型化损坏错误呈现，不影响其它命名空间", async () => {
    const createAdapter = await loadCreateAdapter();

    const backend = createInspectableLocalStorage();
    const adapter = createAdapter({ localStorage: backend });
    const storage = createVersionedStorage({
      storage: adapter,
      currentVersion: 1,
    });

    await storage.save("player", "save", { name: "alice" });
    await storage.save("system", "settings", { theme: "dark" });

    // 直接向平台后端写入损坏数据，模拟平台层记录损坏
    backend.setItem("save:player:save", "corrupted!{{");

    await expect(storage.load("player", "save")).rejects.toThrow(
      SaveCorruptionError,
    );
    // 其它命名空间存档不受影响
    expect(await storage.load("system", "settings")).toEqual({
      version: 1,
      data: { theme: "dark" },
    });
  });

  test("保存失败经 onError 报告而非未处理拒绝，后续事件收敛到最后一次有效状态", async () => {
    const createAdapter = await loadCreateAdapter();
    const createCoordinator = await loadCreateCoordinator();

    const visibility = new MemoryPlatform();
    const adapter = createAdapter({
      localStorage: createInspectableLocalStorage(),
    });
    const storage = createVersionedStorage({
      storage: adapter,
      currentVersion: 1,
    });

    let state = { step: 0 };
    // 首次保存抛错，其后保存恢复正常
    let shouldFail = true;
    const errors: unknown[] = [];
    const coordinator = createCoordinator({
      visibility,
      save: async () => {
        if (shouldFail) {
          shouldFail = false;
          throw new Error("save quota exceeded");
        }
        await storage.save("player", "save", state);
      },
      onError: (error) => {
        errors.push(error);
      },
    });
    coordinator.start();

    // 失败触发：不产生未处理拒绝，错误经 onError 报告
    state = { step: 1 };
    visibility.setVisibility("background");
    await flush();

    // 后续事件触发成功保存，收敛到最后一次有效状态
    state = { step: 2 };
    visibility.setVisibility("foreground");
    state = { step: 3 };
    visibility.setVisibility("background");
    await flush();
    coordinator.dispose();

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("save quota exceeded");
    expect(await storage.load("player", "save")).toEqual({
      version: 1,
      data: { step: 3 },
    });
  });

  test("未配置 onError 时保存失败经 console.error 记录且不产生未处理拒绝", async () => {
    const createAdapter = await loadCreateAdapter();
    const createCoordinator = await loadCreateCoordinator();

    const visibility = new MemoryPlatform();
    const adapter = createAdapter({
      localStorage: createInspectableLocalStorage(),
    });

    const originalError = console.error;
    const reported: unknown[] = [];
    console.error = (error: unknown) => {
      reported.push(error);
    };
    try {
      const coordinator = createCoordinator({
        visibility,
        save: async () => {
          throw new Error("quota exceeded");
        },
      });
      coordinator.start();

      visibility.setVisibility("background");
      await flush();
      coordinator.dispose();
    } finally {
      console.error = originalError;
    }

    // 缺省 onError 走 console.error，而非静默吞掉
    expect(reported).toHaveLength(1);
    expect((reported[0] as Error).message).toBe("quota exceeded");
  });
});
