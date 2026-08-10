import { describe, expect, test } from "bun:test";

import { MemoryPlatform } from "../../../assets/framework/adapters/memory/MemoryPlatform";
import type { PlatformStorage } from "../../../assets/framework/contracts/platform/Platform";
import { MAX_TEAM_SIZE } from "../../../assets/samples/game_auto_battle/logic/config";
import {
    LINEUP_STORAGE_KEY,
    LINEUP_SAVE_VERSION,
    createLineupStore,
} from "../../../assets/samples/game_auto_battle/logic/lineup-store";
import type { AutoBattleLineup } from "../../../assets/samples/game_auto_battle/models";

/** 构造合法编队：指定占用槽，其余为 null。 */
function lineup(occupied: Readonly<Record<number, string>> = {}): AutoBattleLineup {
    const slots = Array.from<unknown, string | null>(
        { length: MAX_TEAM_SIZE },
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
        await seed(
            storage,
            JSON.stringify({ version: 1, data: { foo: "bar" } }),
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
                    return {
                        slots: record.slots.map((slot) =>
                            slot === null ? null : `v2:${slot}`,
                        ),
                    };
                },
            },
        });

        const loaded = await store.load();
        expect(loaded?.version).toBe(2);
        expect(loaded?.data.slots[0]).toBe("v2:a");
    });

    test("rejects an older record when no migrator is registered", async () => {
        const storage = new MemoryPlatform();
        const legacySlots = Array.from<unknown, string | null>(
            { length: MAX_TEAM_SIZE },
            () => null,
        );
        legacySlots[0] = "a";
        await seed(
            storage,
            JSON.stringify({ version: 1, data: { slots: legacySlots } }),
        );

        await expect(
            createLineupStore({ storage, currentVersion: 2 }).load(),
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
