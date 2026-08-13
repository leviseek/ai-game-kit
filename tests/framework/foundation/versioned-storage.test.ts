import { describe, expect, test } from "bun:test";

import { MemoryPlatform } from "../../../assets/framework/adapters/memory/MemoryPlatform";
import type { PlatformStorage } from "../../../assets/framework/contracts/platform/Platform";
import type { SaveMigrator, SaveVersion, VersionedStorageOptions } from "../../../assets/framework/contracts/storage/VersionedStorage";
import { SaveCorruptionError, SaveMigrationError, SaveSerializationError, SaveVersionError, createVersionedStorage } from "../../../assets/framework/core/storage/VersionedStorage";

interface _PlayerSave {
    readonly name: string;
    readonly level: number;
}

function createOptions(currentVersion: SaveVersion, migrators?: Readonly<Record<SaveVersion, SaveMigrator>>): VersionedStorageOptions {
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
        const storage = createVersionedStorage(createOptions(1));

        await storage.save("player-a", "save", { name: "alice", level: 1 });
        await storage.save("player-b", "save", { name: "bob", level: 2 });

        const alice = await storage.load("player-a", "save");
        const bob = await storage.load("player-b", "save");

        expect(alice?.data).toEqual({ name: "alice", level: 1 });
        expect(bob?.data).toEqual({ name: "bob", level: 2 });
    });

    test("deleting one namespace leaves the other namespace intact", async () => {
        const storage = createVersionedStorage(createOptions(1));

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
        const storage = createVersionedStorage(createOptions(1));

        expect(await storage.load("player-a", "missing")).toBeNull();
    });
});

describe("VersionedStorage schema version", () => {
    test("a written save records its schema version", async () => {
        const storage = createVersionedStorage(createOptions(3));

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
        const backend = emptyBackend();
        const legacy = createVersionedStorage({
            storage: backend,
            currentVersion: 1,
        });
        await legacy.save("player", "save", { name: "alice", level: 1 });

        const storage = createVersionedStorage({
            storage: backend,
            currentVersion: 3,
            migrators: {
                1: (data) => ({ ...(data as object), migratedTo: 2 }),
                2: (data) => ({ ...(data as object), migratedTo: 3 }),
            },
        });

        expect(await storage.load("player", "save")).toEqual({
            version: 3,
            data: { name: "alice", level: 1, migratedTo: 3 },
        });
    });

    test("a migration receives the output of the previous migration step", async () => {
        const backend = emptyBackend();
        const legacy = createVersionedStorage({
            storage: backend,
            currentVersion: 1,
        });
        await legacy.save("player", "save", { name: "alice" });

        const seen: unknown[] = [];
        const storage = createVersionedStorage({
            storage: backend,
            currentVersion: 3,
            migrators: {
                1: (data) => {
                    seen.push(data);
                    return { ...(data as object), step: "v1-to-v2" };
                },
                2: (data) => {
                    seen.push(data);
                    return { ...(data as object), step: "v2-to-v3" };
                },
            },
        });

        await storage.load("player", "save");

        expect(seen).toEqual([{ name: "alice" }, { name: "alice", step: "v1-to-v2" }]);
    });

    test("a missing migration step fails with a typed error naming the gap", async () => {
        const backend = emptyBackend();
        const legacy = createVersionedStorage({
            storage: backend,
            currentVersion: 2,
        });
        await legacy.save("player", "save", { name: "alice", level: 1 });

        const storage = createVersionedStorage({
            storage: backend,
            currentVersion: 3,
            migrators: {
                1: (data) => data,
            },
        });

        expect(() => storage.load("player", "save")).toThrow(SaveMigrationError);
    });

    test("a migration that throws fails the whole load with a typed error", async () => {
        const backend = emptyBackend();
        const legacy = createVersionedStorage({
            storage: backend,
            currentVersion: 1,
        });
        await legacy.save("player", "save", { name: "alice" });

        const storage = createVersionedStorage({
            storage: backend,
            currentVersion: 3,
            migrators: {
                1: () => {
                    throw new Error("corrupt legacy data");
                },
            },
        });

        expect(() => storage.load("player", "save")).toThrow(SaveMigrationError);
    });

    test("a failing migration preserves the underlying error as cause", async () => {
        const backend = emptyBackend();
        const legacy = createVersionedStorage({
            storage: backend,
            currentVersion: 1,
        });
        await legacy.save("player", "save", { name: "alice" });

        const underlying = new Error("corrupt legacy data");
        const storage = createVersionedStorage({
            storage: backend,
            currentVersion: 3,
            migrators: {
                1: () => {
                    throw underlying;
                },
            },
        });

        try {
            await storage.load("player", "save");
            expect.unreachable("load should have thrown");
        } catch (error) {
            expect(error).toBeInstanceOf(SaveMigrationError);
            const migrationError = error as SaveMigrationError;
            expect(migrationError.fromVersion).toBe(1);
            expect(migrationError.toVersion).toBe(2);
            expect(migrationError.cause).toBe(underlying);
        }
    });
});

describe("VersionedStorage future version and serialization guards", () => {
    test("a save from a future version is rejected with a typed error", async () => {
        const backend = emptyBackend();
        const future = createVersionedStorage({
            storage: backend,
            currentVersion: 5,
        });
        await future.save("player", "future", { name: "alice" });

        const storage = createVersionedStorage({
            storage: backend,
            currentVersion: 3,
        });

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

    test("rejecting a future save leaves the stored data untouched", async () => {
        const backend = emptyBackend();
        const future = createVersionedStorage({
            storage: backend,
            currentVersion: 5,
        });
        await future.save("player", "save", { name: "alice" });

        const storage = createVersionedStorage({
            storage: backend,
            currentVersion: 3,
        });

        expect(() => storage.load("player", "save")).toThrow(SaveVersionError);

        // 未来版本拒绝不得破坏原数据：以写入版本重新读取仍返回原始数据。
        const reload = await future.load("player", "save");
        expect(reload).toEqual({
            version: 5,
            data: { name: "alice" },
        });
    });

    test("a DTO with undefined is rejected before any write", async () => {
        const storage = createVersionedStorage(createOptions(1));

        expect(() => storage.save("player", "save", { name: "alice", extra: undefined })).toThrow(SaveSerializationError);

        expect(await storage.load("player", "save")).toBeNull();
    });

    test("a DTO containing a function is rejected before any write", async () => {
        const storage = createVersionedStorage(createOptions(1));

        expect(() => storage.save("player", "save", { name: "alice", fn: () => {} })).toThrow(SaveSerializationError);

        expect(await storage.load("player", "save")).toBeNull();
    });

    test("a DTO with a circular reference is rejected before any write", async () => {
        const storage = createVersionedStorage(createOptions(1));

        const circular: Record<string, unknown> = { name: "alice" };
        circular.self = circular;

        expect(() => storage.save("player", "save", circular)).toThrow(SaveSerializationError);

        expect(await storage.load("player", "save")).toBeNull();
    });

    test("a DTO containing a BigInt is rejected before any write", async () => {
        const storage = createVersionedStorage(createOptions(1));

        expect(() => storage.save("player", "save", { name: "alice", big: 123n })).toThrow(SaveSerializationError);

        expect(await storage.load("player", "save")).toBeNull();
    });

    test("a DTO containing a symbol is rejected before any write", async () => {
        const storage = createVersionedStorage(createOptions(1));

        expect(() => storage.save("player", "save", { name: "alice", sym: Symbol("id") })).toThrow(SaveSerializationError);

        expect(await storage.load("player", "save")).toBeNull();
    });

    test("a DTO containing a non-finite number is rejected before any write", async () => {
        const storage = createVersionedStorage(createOptions(1));

        expect(() => storage.save("player", "save", { name: "alice", score: NaN })).toThrow(SaveSerializationError);

        expect(await storage.load("player", "save")).toBeNull();

        expect(() => storage.save("player", "save", { name: "alice", score: Infinity })).toThrow(SaveSerializationError);
    });

    test("a nested non-serializable value is rejected before any write", async () => {
        const storage = createVersionedStorage(createOptions(1));

        expect(() =>
            storage.save("player", "save", {
                name: "alice",
                stats: { bonus: () => 1 },
            }),
        ).toThrow(SaveSerializationError);

        expect(await storage.load("player", "save")).toBeNull();

        expect(() =>
            storage.save("player", "save", {
                name: "alice",
                items: [{ hidden: undefined }],
            }),
        ).toThrow(SaveSerializationError);
    });
});

describe("VersionedStorage corruption guards", () => {
    // 直写底层存储键 "save:player:save" 模拟损坏记录。该键与
    // composeStorageKey("player", "save") 编码结果一致（player/save 均无
    // 保留字符，encodeURIComponent 后不变）；若未来修改键编码方式需同步。
    test("a record that is not valid JSON is rejected as corrupted", async () => {
        const backend = emptyBackend();
        await backend.set("save:player:save", "not-json{{");

        const storage = createVersionedStorage({
            storage: backend,
            currentVersion: 3,
        });

        expect(() => storage.load("player", "save")).toThrow(SaveCorruptionError);
    });

    test("a record that is not an object is rejected as corrupted", async () => {
        const backend = emptyBackend();
        await backend.set("save:player:save", '"hello"');

        const storage = createVersionedStorage({
            storage: backend,
            currentVersion: 3,
        });

        expect(() => storage.load("player", "save")).toThrow(SaveCorruptionError);
    });

    test("a record missing the version field is rejected as corrupted", async () => {
        const backend = emptyBackend();
        await backend.set("save:player:save", JSON.stringify({ data: {} }));

        const storage = createVersionedStorage({
            storage: backend,
            currentVersion: 3,
        });

        expect(() => storage.load("player", "save")).toThrow(SaveCorruptionError);
    });

    test("a record with a non-positive version is rejected as corrupted", async () => {
        const backend = emptyBackend();
        await backend.set("save:player:save", JSON.stringify({ version: 0, data: {} }));

        const storage = createVersionedStorage({
            storage: backend,
            currentVersion: 3,
        });

        expect(() => storage.load("player", "save")).toThrow(SaveCorruptionError);
    });
});

describe("VersionedStorage key encoding", () => {
    test("a separator inside namespace or key does not collide with another namespace", async () => {
        const backend = emptyBackend();
        const storage = createVersionedStorage({
            storage: backend,
            currentVersion: 1,
        });

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

    test("percent-encoded characters round-trip through storage keys", async () => {
        const backend = emptyBackend();
        const storage = createVersionedStorage({
            storage: backend,
            currentVersion: 1,
        });

        await storage.save("play%er", "s%ave", { name: "alice" });

        expect(await storage.load("play%er", "s%ave")).toEqual({
            version: 1,
            data: { name: "alice" },
        });
        expect(await storage.load("play%er", "save")).toBeNull();
    });
});

describe("VersionedStorage injected backend", () => {
    test("works over an injected memory backend", async () => {
        const backend = emptyBackend();
        const legacy = createVersionedStorage({
            storage: backend,
            currentVersion: 1,
        });
        await legacy.save("player", "save", { name: "alice", level: 1 });

        const storage = createVersionedStorage({
            storage: backend,
            currentVersion: 2,
            migrators: {
                1: (data) => ({ ...(data as object), migrated: true }),
            },
        });

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

    test("two repositories over the same backend keep namespaces independent", async () => {
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

        // 共享 backend：同一命名空间经任意仓库实例都能读到同一份数据。
        expect(await first.load("player-a", "save")).toEqual({
            version: 1,
            data: { name: "alice" },
        });
        expect(await second.load("player-a", "save")).toEqual({
            version: 1,
            data: { name: "alice" },
        });
        expect(await first.load("player-b", "save")).toEqual({
            version: 1,
            data: { name: "bob" },
        });
        expect(await second.load("player-b", "save")).toEqual({
            version: 1,
            data: { name: "bob" },
        });
    });
});
