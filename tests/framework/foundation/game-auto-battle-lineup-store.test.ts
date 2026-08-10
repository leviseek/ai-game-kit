import { describe, expect, test } from "bun:test";

import { MemoryPlatform } from "../../../assets/framework/adapters/memory/MemoryPlatform";
import type { PlatformStorage } from "../../../assets/framework/contracts/platform/Platform";
import { MAX_TEAM_SIZE } from "../../../assets/samples/game_auto_battle/logic/config";
import { FORMATION_GRID_SIZE } from "../../../assets/samples/game_auto_battle/logic/grid";
import {
    LINEUP_STORAGE_KEY,
    LINEUP_SAVE_VERSION,
    createLineupStore,
} from "../../../assets/samples/game_auto_battle/logic/lineup-store";
import type { AutoBattleLineup } from "../../../assets/samples/game_auto_battle/models";

/** 构造合法编队：指定占用槽，其余为 null；定长为布阵区容量 FORMATION_GRID_SIZE。 */
function lineup(occupied: Readonly<Record<number, string>> = {}): AutoBattleLineup {
    const slots = Array.from<unknown, string | null>(
        { length: FORMATION_GRID_SIZE },
        () => null,
    );
    for (const [slot, heroId] of Object.entries(occupied)) {
        slots[Number(slot)] = heroId;
    }
    return { slots };
}

/** 直接把一条原始记录写入底层存储键（模拟旧版本/损坏存档）。 */
function seed(storage: PlatformStorage, raw: string): Promise<void> {
    return storage.set(LINEUP_STORAGE_KEY, raw);
}

describe("Auto-battle lineup store round-trip", () => {
    test("save then load returns the same lineup at the current version", async () => {
        const storage = new MemoryPlatform();
        const store = createLineupStore({ storage });
        const lineupValue = lineup({ 0: "a", 3: "e" });

        await store.save(lineupValue);

        const loaded = await store.load();
        expect(loaded?.version).toBe(LINEUP_SAVE_VERSION);
        expect(loaded?.data).toEqual(lineupValue);
    });

    test("a fresh store over the same storage restores the saved lineup", async () => {
        const storage = new MemoryPlatform();
        await createLineupStore({ storage }).save(lineup({ 1: "b" }));

        // 新实例 = 模拟重启
        const restarted = await createLineupStore({ storage }).load();

        expect(restarted?.data).toEqual(lineup({ 1: "b" }));
    });

    test("load returns null when no record exists", async () => {
        const store = createLineupStore({ storage: new MemoryPlatform() });
        expect(await store.load()).toBeNull();
    });
});

describe("Auto-battle lineup store corruption and version guards", () => {
    test("rejects a corrupted record with invalid JSON", async () => {
        const storage = new MemoryPlatform();
        await seed(storage, "not-json");
        await expect(
            createLineupStore({ storage }).load(),
        ).rejects.toThrow(/corrupted/);
    });

    test("rejects a record whose data is not a valid lineup shape", async () => {
        const storage = new MemoryPlatform();
        // 当前版本存档直接过 isLineupRecord 形状校验（v1 数据会先走迁移路径，
        // 无 slots 的损坏形状在迁移器内即抛 TypeError，不再回落到 corrupt）
        await seed(
            storage,
            JSON.stringify({ version: LINEUP_SAVE_VERSION, data: { foo: "bar" } }),
        );
        await expect(
            createLineupStore({ storage }).load(),
        ).rejects.toThrow(/corrupted/);
    });

    test("rejects a record with a future save version", async () => {
        const storage = new MemoryPlatform();
        await seed(
            storage,
            JSON.stringify({ version: 99, data: lineup({ 0: "a" }) }),
        );
        await expect(
            createLineupStore({ storage }).load(),
        ).rejects.toThrow(/newer/);
    });
});

describe("Auto-battle lineup store schema migration", () => {
    test("migrates an older record through the registered migrator chain", async () => {
        const storage = new MemoryPlatform();
        // 旧版本 v1 存档：slots 里 heroId 是旧前缀，迁移器负责加 "v2:" 前缀
        const legacySlots = Array.from<unknown, string | null>(
            { length: MAX_TEAM_SIZE },
            () => null,
        );
        legacySlots[0] = "a";
        await seed(
            storage,
            JSON.stringify({ version: 1, data: { slots: legacySlots } }),
        );

        const store = createLineupStore({
            storage,
            currentVersion: 2,
            migrators: {
                1: (data) => {
                    const record = data as { slots: readonly (string | null)[] };
                    // 自定义迁移器：加 "v2:" 前缀并补齐到布阵区容量（新 schema 定长 9）
                    const slots: (string | null)[] = Array.from(
                        { length: FORMATION_GRID_SIZE },
                        (_, index) => {
                            const heroId = record.slots[index] ?? null;
                            return heroId === null ? null : `v2:${heroId}`;
                        },
                    );
                    return { slots };
                },
            },
        });

        const loaded = await store.load();
        expect(loaded?.version).toBe(2);
        expect(loaded?.data.slots).toHaveLength(FORMATION_GRID_SIZE);
        expect(loaded?.data.slots[0]).toBe("v2:a");
    });

    test("migrates a legacy v1 record (6-length slots) to v2 (9-length) by default", async () => {
        const storage = new MemoryPlatform();
        // 旧版本 v1 存档：slots 为 6 长度（MAX_TEAM_SIZE），这正是旧 schema 的定长
        const legacySlots = Array.from<unknown, string | null>(
            { length: MAX_TEAM_SIZE },
            () => null,
        );
        legacySlots[0] = "a";
        await seed(
            storage,
            JSON.stringify({ version: 1, data: { slots: legacySlots } }),
        );

        const store = createLineupStore({ storage });

        const loaded = await store.load();
        expect(loaded?.version).toBe(LINEUP_SAVE_VERSION);
        expect(loaded?.data.slots).toHaveLength(FORMATION_GRID_SIZE);
        expect(loaded?.data.slots[0]).toBe("a");
        expect(loaded?.data.slots[MAX_TEAM_SIZE]).toBeNull();
        expect(loaded?.data.slots[FORMATION_GRID_SIZE - 1]).toBeNull();
    });

    test("save writes at the current (v2) version", async () => {
        const storage = new MemoryPlatform();
        const store = createLineupStore({ storage });

        await store.save(lineup({ 0: "a" }));

        const raw = await storage.get(LINEUP_STORAGE_KEY);
        const parsed = JSON.parse(raw!) as { version: number; data: AutoBattleLineup };
        expect(parsed.version).toBe(2);
        expect(parsed.data.slots).toHaveLength(FORMATION_GRID_SIZE);
    });

    test("rejects an older record when no migrator is registered for its version", async () => {
        const storage = new MemoryPlatform();
        await seed(
            storage,
            JSON.stringify({ version: 2, data: lineup({ 0: "a" }) }),
        );

        // 存储要求 v3，但显式置空迁移映射：v2→v3 迁移器缺失应拒绝
        await expect(
            createLineupStore({ storage, currentVersion: 3, migrators: {} }).load(),
        ).rejects.toThrow(/migration/);
    });

    test("save always writes at the current version", async () => {
        const storage = new MemoryPlatform();
        const store = createLineupStore({ storage, currentVersion: 2 });

        await store.save(lineup({ 0: "a" }));

        const raw = await storage.get(LINEUP_STORAGE_KEY);
        expect(JSON.parse(raw!)?.version).toBe(2);
    });
});
