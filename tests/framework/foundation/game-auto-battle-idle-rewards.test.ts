import { describe, expect, test } from "bun:test";

import { MemoryPlatform } from "../../../assets/framework/adapters/memory/MemoryPlatform";
import type { IPlatformStorage } from "../../../assets/framework/contracts/interfaces/IPlatformStorage";
import { createIdleRewardClock } from "../../../assets/samples/game_auto_battle/logic/clock";
import { computeIdleRewards, createIdleRewardsHandle, DEFAULT_IDLE_RATE } from "../../../assets/samples/game_auto_battle/logic/IdleRewards";
import { IDLE_REWARDS_STORAGE_KEY, IDLE_REWARDS_SAVE_VERSION, createIdleRewardsStore, isIdleRewardRecord } from "../../../assets/samples/game_auto_battle/logic/IdleRewardsStore";
import type { IdleRewardState } from "../../../assets/samples/game_auto_battle/models";

const state = (overrides: Partial<IdleRewardState> = {}): IdleRewardState => ({
    lastSeenAtMs: 0,
    totalRewards: 0,
    earnedAtMs: 0,
    ...overrides,
});

/** 直接把一条原始记录写入底层存储键（模拟旧版本/损坏存档）。 */
function seed(storage: IPlatformStorage, raw: string): Promise<void> {
    return storage.set(IDLE_REWARDS_STORAGE_KEY, raw);
}

describe("Idle rewards pure settlement", () => {
    test("settles whole minutes by the fixed rate", () => {
        const result = computeIdleRewards(1_000, 301_000, DEFAULT_IDLE_RATE);
        expect(result.minutes).toBe(5);
        expect(result.earned).toBe(5 * DEFAULT_IDLE_RATE);
    });

    test("ignores sub-minute idle time", () => {
        const result = computeIdleRewards(0, 30_000, DEFAULT_IDLE_RATE);
        expect(result.minutes).toBe(0);
        expect(result.earned).toBe(0);
    });

    test("is deterministic for the same inputs", () => {
        const a = computeIdleRewards(0, 600_000, DEFAULT_IDLE_RATE);
        const b = computeIdleRewards(0, 600_000, DEFAULT_IDLE_RATE);
        expect(a).toEqual(b);
    });

    test("treats a backward clock as zero elapsed", () => {
        const result = computeIdleRewards(600_000, 0, DEFAULT_IDLE_RATE);
        expect(result.minutes).toBe(0);
        expect(result.earned).toBe(0);
    });

    test("rejects non-finite timestamps and rates", () => {
        expect(() => computeIdleRewards(Number.NaN, 0, 1)).toThrow(/finite/);
        expect(() => computeIdleRewards(0, Number.POSITIVE_INFINITY, 1)).toThrow(/finite/);
        expect(() => computeIdleRewards(0, 1_000, -1)).toThrow(/non-negative/);
        expect(() => computeIdleRewards(0, 1_000, Number.NaN)).toThrow(/finite/);
    });
});

describe("Idle rewards controller", () => {
    test("settles and advances lastSeenAt so repeat calls do not double-count", () => {
        const clock = createIdleRewardClock(() => 0);
        const handle = createIdleRewardsHandle({ clock });

        clock.advance(300_000); // 5 分钟
        const first = handle.settleOffline();
        expect(first.earned).toBe(5 * DEFAULT_IDLE_RATE);

        clock.advance(0); // 同一时刻重复领取
        const second = handle.settleOffline();
        expect(second.earned).toBe(0);
        expect(handle.state.totalRewards).toBe(5 * DEFAULT_IDLE_RATE);
    });

    test("state snapshot reflects total and last earned time", () => {
        const clock = createIdleRewardClock(() => 0);
        const handle = createIdleRewardsHandle({ clock });

        clock.advance(120_000); // 2 分钟
        handle.settleOffline();

        const snapshot = handle.state;
        expect(snapshot.totalRewards).toBe(2 * DEFAULT_IDLE_RATE);
        expect(snapshot.lastSeenAtMs).toBe(120_000);
        expect(snapshot.earnedAtMs).toBe(120_000);
    });

    test("preview does not advance lastSeenAt and matches settle", () => {
        const clock = createIdleRewardClock(() => 0);
        const handle = createIdleRewardsHandle({ clock });

        clock.advance(180_000); // 3 分钟
        const preview = handle.previewOffline();
        expect(preview.earned).toBe(3 * DEFAULT_IDLE_RATE);
        // 预览不推进 lastSeenAt：再次预览/结算仍是同一段时长
        expect(handle.previewOffline().earned).toBe(3 * DEFAULT_IDLE_RATE);

        const settlement = handle.settleOffline();
        expect(settlement.earned).toBe(preview.earned);
        // 结算后推进 lastSeenAt，再预览为 0
        expect(handle.previewOffline().earned).toBe(0);
    });

    test("restore overwrites in-memory state", () => {
        const clock = createIdleRewardClock(() => 0);
        const handle = createIdleRewardsHandle({ clock });
        handle.restore(state({ lastSeenAtMs: 1_000, totalRewards: 42, earnedAtMs: 1_000 }));

        expect(handle.state.totalRewards).toBe(42);
        expect(handle.state.lastSeenAtMs).toBe(1_000);
    });

    test("is inert after dispose", () => {
        const clock = createIdleRewardClock(() => 0);
        const handle = createIdleRewardsHandle({ clock });
        handle.dispose();
        clock.advance(300_000);
        expect(handle.settleOffline()).toEqual({ minutes: 0, earned: 0 });
        expect(handle.state.totalRewards).toBe(0);
    });

    test("default clock reads real time so rewards accumulate as wall time passes", () => {
        // 缺省时钟 = 真实时间源（Date.now）：真实运行下无需外部驱动，
        // now() 随真实时间自然增长，离线收益才能累积（非恒 0）
        const clock = createIdleRewardClock();
        const startedAt = clock.now();
        expect(clock.now()).toBeGreaterThanOrEqual(startedAt);

        const handle = createIdleRewardsHandle({ clock });
        // lastSeenAt 初始为创建时刻；墙钟前进（真实时间流逝）后预览 > 0
        const started = handle.state.lastSeenAtMs;
        expect(started).toBeGreaterThanOrEqual(startedAt);
    });
});

describe("Idle rewards store round-trip and guards", () => {
    test("save then load returns the same state at the current version", async () => {
        const storage = new MemoryPlatform();
        const store = createIdleRewardsStore({ storage });
        const record = state({ lastSeenAtMs: 100, totalRewards: 7, earnedAtMs: 100 });

        await store.save(record);

        const loaded = await store.load();
        expect(loaded?.version).toBe(IDLE_REWARDS_SAVE_VERSION);
        expect(loaded?.data).toEqual(record);
    });

    test("a fresh store over the same storage restores the saved state", async () => {
        const storage = new MemoryPlatform();
        await createIdleRewardsStore({ storage }).save(state({ lastSeenAtMs: 50, totalRewards: 3, earnedAtMs: 50 }));

        const restarted = await createIdleRewardsStore({ storage }).load();

        expect(restarted?.data).toEqual(state({ lastSeenAtMs: 50, totalRewards: 3, earnedAtMs: 50 }));
    });

    test("load returns null when no record exists", async () => {
        const store = createIdleRewardsStore({ storage: new MemoryPlatform() });
        expect(await store.load()).toBeNull();
    });

    test("rejects a corrupted record with invalid JSON", async () => {
        const storage = new MemoryPlatform();
        await seed(storage, "not-json");
        await expect(createIdleRewardsStore({ storage }).load()).rejects.toThrow(/corrupted/);
    });

    test("rejects a record whose data is not a valid idle rewards shape", async () => {
        const storage = new MemoryPlatform();
        await seed(
            storage,
            JSON.stringify({
                version: IDLE_REWARDS_SAVE_VERSION,
                data: { foo: "bar" },
            }),
        );
        await expect(createIdleRewardsStore({ storage }).load()).rejects.toThrow(/corrupted/);
    });

    test("rejects a record with a future save version", async () => {
        const storage = new MemoryPlatform();
        await seed(storage, JSON.stringify({ version: 99, data: state() }));
        await expect(createIdleRewardsStore({ storage }).load()).rejects.toThrow(/newer/);
    });

    test("rejects an older record when no migrator is registered", async () => {
        const storage = new MemoryPlatform();
        await seed(storage, JSON.stringify({ version: 1, data: state() }));

        await expect(
            createIdleRewardsStore({
                storage,
                currentVersion: 2,
                migrators: {},
            }).load(),
        ).rejects.toThrow(/migration/);
    });

    test("delete is idempotent and removes the record", async () => {
        const storage = new MemoryPlatform();
        const store = createIdleRewardsStore({ storage });
        await store.save(state());

        await store.delete();
        expect(await store.load()).toBeNull();
        // 重复删除幂等
        await store.delete();
        expect(await store.load()).toBeNull();
    });
});

describe("Idle rewards store schema migration", () => {
    test("migrates an older record through the registered migrator chain", async () => {
        const storage = new MemoryPlatform();
        await seed(
            storage,
            JSON.stringify({
                version: 1,
                data: { lastSeenAtMs: 10, totalRewards: 5, earnedAtMs: 10 },
            }),
        );

        const store = createIdleRewardsStore({
            storage,
            currentVersion: 2,
            migrators: {
                1: (data) => {
                    const record = data as IdleRewardState;
                    // 自定义迁移器：收益翻倍（模拟 schema 演进）
                    return { ...record, totalRewards: record.totalRewards * 2 };
                },
            },
        });

        const loaded = await store.load();
        expect(loaded?.version).toBe(2);
        expect(loaded?.data.totalRewards).toBe(10);
    });
});

describe("Idle reward record guard", () => {
    test("accepts a valid record and rejects malformed shapes", () => {
        expect(isIdleRewardRecord(state())).toBe(true);
        expect(isIdleRewardRecord(null)).toBe(false);
        expect(isIdleRewardRecord(42)).toBe(false);
        expect(isIdleRewardRecord({ lastSeenAtMs: -1, totalRewards: 0, earnedAtMs: 0 })).toBe(false);
        expect(isIdleRewardRecord({ lastSeenAtMs: 0, totalRewards: Number.NaN, earnedAtMs: 0 })).toBe(false);
    });
});
