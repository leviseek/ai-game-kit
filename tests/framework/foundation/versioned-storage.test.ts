import { describe, expect, test } from "bun:test";

import { MemoryPlatform } from "../../../assets/framework/adapters/memory/MemoryPlatform";
import type { PlatformStorage } from "../../../assets/framework/contracts/platform/Platform";
import type {
  SaveMigrator,
  SaveVersion,
  VersionedStorage,
  VersionedStorageOptions,
} from "../../../assets/framework/contracts/storage/VersionedStorage";
import {
  SaveMigrationError,
  SaveSerializationError,
  SaveVersionError,
} from "../../../assets/framework/contracts/storage/VersionedStorage";
import { createVersionedStorage } from "../../../assets/framework/core/storage/VersionedStorage";

interface PlayerSave {
  readonly name: string;
  readonly level: number;
}

function createOptions(
  currentVersion: SaveVersion,
  migrators?: Readonly<Record<SaveVersion, SaveMigrator>>,
): VersionedStorageOptions {
  return {
    storage: new MemoryPlatform(),
    currentVersion,
    migrators,
  };
}

function emptyBackend(): PlatformStorage {
  return new MemoryPlatform();
}

describe("VersionedStorage namespace isolation", () => {
  test("saves with the same key in different namespaces stay independent", async () => {
    const storage = createVersionedStorage(
      createOptions(1),
    );

    await storage.save("player-a", "save", { name: "alice", level: 1 });
    await storage.save("player-b", "save", { name: "bob", level: 2 });

    const alice = await storage.load("player-a", "save");
    const bob = await storage.load("player-b", "save");

    expect(alice?.data).toEqual({ name: "alice", level: 1 });
    expect(bob?.data).toEqual({ name: "bob", level: 2 });
  });

  test("deleting one namespace leaves the other namespace intact", async () => {
    const storage = createVersionedStorage(
      createOptions(1),
    );

    await storage.save("player-a", "save", { name: "alice", level: 1 });
    await storage.save("player-b", "save", { name: "bob", level: 2 });

    await storage.delete("player-a", "save");

    expect(await storage.load("player-a", "save")).toBeNull();
    expect(await storage.load("player-b", "save")).toEqual({
      version: 1,
      data: { name: "bob", level: 2 },
    });
  });

  test("loading an absent save returns null", async () => {
    const storage = createVersionedStorage(
      createOptions(1),
    );

    expect(await storage.load("player-a", "missing")).toBeNull();
  });
});

describe("VersionedStorage schema version", () => {
  test("a written save records its schema version", async () => {
    const storage = createVersionedStorage(
      createOptions(3),
    );

    await storage.save("player", "save", { name: "alice", level: 1 });

    expect(await storage.load("player", "save")).toEqual({
      version: 3,
      data: { name: "alice", level: 1 },
    });
  });

  test("a save at the current version loads without migration", async () => {
    const migrator: SaveMigrator = () => {
      throw new Error("must not migrate a current-version save");
    };
    const storage = createVersionedStorage(createOptions(2, { 1: migrator }));

    await storage.save("player", "save", { name: "alice", level: 1 });

    expect(await storage.load("player", "save")).toEqual({
      version: 2,
      data: { name: "alice", level: 1 },
    });
  });
});

describe("VersionedStorage consecutive migration", () => {
  test("a legacy save migrates forward through consecutive versions", async () => {
    const storage = createVersionedStorage(
      createOptions(3, {
        1: (data) => ({ ...(data as object), migratedTo: 2 }),
        2: (data) => ({ ...(data as object), migratedTo: 3 }),
      }),
    );

    await storage.save("player", "save", { name: "alice", level: 1 });

    expect(await storage.load("player", "save")).toEqual({
      version: 3,
      data: { name: "alice", level: 1, migratedTo: 3 },
    });
  });

  test("a migration receives the output of the previous migration step", async () => {
    const seen: unknown[] = [];
    const storage = createVersionedStorage(
      createOptions(3, {
        1: (data) => {
          seen.push(data);
          return { ...(data as object), step: "v1-to-v2" };
        },
        2: (data) => {
          seen.push(data);
          return { ...(data as object), step: "v2-to-v3" };
        },
      }),
    );

    await storage.save("player", "save", { name: "alice" });
    await storage.load("player", "save");

    expect(seen).toEqual([
      { name: "alice" },
      { name: "alice", step: "v1-to-v2" },
    ]);
  });

  test("a missing migration step fails with a typed error naming the gap", async () => {
    const storage = createVersionedStorage(
      createOptions(3, {
        1: (data) => data,
      }),
    );

    await storage.save("player", "save", { name: "alice", level: 1 });

    expect(() => storage.load("player", "save")).toThrow(
      SaveMigrationError,
    );
  });

  test("a migration that throws fails the whole load with a typed error", async () => {
    const storage = createVersionedStorage(
      createOptions(3, {
        1: () => {
          throw new Error("corrupt legacy data");
        },
      }),
    );

    await storage.save("player", "save", { name: "alice" });

    expect(() => storage.load("player", "save")).toThrow(SaveMigrationError);
  });
});

describe("VersionedStorage future version and serialization guards", () => {
  test("a save from a future version is rejected with a typed error", async () => {
    const storage = createVersionedStorage(
      createOptions(3),
    );

    await storage.save("player", "future", { name: "alice" });

    expect(() => storage.load("player", "future")).toThrow(
      SaveVersionError,
    );
  });

  test("rejecting a future save leaves the stored data untouched", async () => {
    const storage = createVersionedStorage(
      createOptions(3),
    );

    await storage.save("player", "save", { name: "alice" });

    try {
      await storage.load("player", "save");
    } catch {
      // 未来版本拒绝不得破坏原数据。
    }

    expect(await storage.load("player", "save")).toEqual({
      version: 3,
      data: { name: "alice" },
    });
  });

  test("a DTO with undefined is rejected before any write", async () => {
    const storage = createVersionedStorage(
      createOptions(1),
    );

    expect(() =>
      storage.save("player", "save", { name: "alice", extra: undefined }),
    ).toThrow(SaveSerializationError);

    expect(await storage.load("player", "save")).toBeNull();
  });

  test("a DTO containing a function is rejected before any write", async () => {
    const storage = createVersionedStorage(
      createOptions(1),
    );

    expect(() =>
      storage.save("player", "save", { name: "alice", fn: () => {} }),
    ).toThrow(SaveSerializationError);

    expect(await storage.load("player", "save")).toBeNull();
  });

  test("a DTO with a circular reference is rejected before any write", async () => {
    const storage = createVersionedStorage(
      createOptions(1),
    );

    const circular: Record<string, unknown> = { name: "alice" };
    circular.self = circular;

    expect(() =>
      storage.save("player", "save", circular),
    ).toThrow(SaveSerializationError);

    expect(await storage.load("player", "save")).toBeNull();
  });

  test("a DTO containing a BigInt is rejected before any write", async () => {
    const storage = createVersionedStorage(
      createOptions(1),
    );

    expect(() =>
      storage.save("player", "save", { name: "alice", big: 123n }),
    ).toThrow(SaveSerializationError);

    expect(await storage.load("player", "save")).toBeNull();
  });
});

describe("VersionedStorage injected backend", () => {
  test("works over an injected memory backend", async () => {
    const storage = createVersionedStorage(
      createOptions(2, {
        1: (data) => ({ ...(data as object), migrated: true }),
      }),
    );

    await storage.save("player", "save", { name: "alice", level: 1 });

    expect(await storage.load("player", "save")).toEqual({
      version: 2,
      data: { name: "alice", level: 1, migrated: true },
    });
  });

  test("swapping the backend does not change the caller code", async () => {
    const backend: PlatformStorage = {
      entries: new Map<string, string>(),
      async get(key) {
        return this.entries.get(key) ?? null;
      },
      async set(key, value) {
        this.entries.set(key, value);
      },
      async delete(key) {
        this.entries.delete(key);
      },
    };
    const storage = createVersionedStorage({
      storage: backend,
      currentVersion: 1,
    });

    await storage.save("player", "save", { name: "alice", level: 1 });

    expect(await storage.load("player", "save")).toEqual({
      version: 1,
      data: { name: "alice", level: 1 },
    });
  });

  test("two repositories over the same backend stay isolated by namespace", async () => {
    const backend = emptyBackend();
    const first = createVersionedStorage({
      storage: backend,
      currentVersion: 1,
    });
    const second = createVersionedStorage({
      storage: backend,
      currentVersion: 1,
    });

    await first.save("player-a", "save", { name: "alice" });
    await second.save("player-b", "save", { name: "bob" });

    expect(await first.load("player-a", "save")).toEqual({
      version: 1,
      data: { name: "alice" },
    });
    expect(await first.load("player-b", "save")).toBeNull();
    expect(await second.load("player-b", "save")).toEqual({
      version: 1,
      data: { name: "bob" },
    });
  });
});
