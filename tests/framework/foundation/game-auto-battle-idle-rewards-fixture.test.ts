import { describe, expect, test } from "bun:test";

import { MemoryPlatform } from "../../../assets/framework/adapters/memory/MemoryPlatform";
import { createIdleRewardClock } from "../../../assets/samples/game_auto_battle/logic/clock";
import { createIdleRewardsHandle } from "../../../assets/samples/game_auto_battle/logic/idle-rewards";
import {
    IDLE_REWARDS_STORAGE_KEY,
    createIdleRewardsStore,
} from "../../../assets/samples/game_auto_battle/logic/idle-rewards-store";
import { createAutoBattleFixture } from "../../../assets/samples/game_auto_battle/assembly";

/** 直接把一条原始记录写入底层存储键（模拟旧版本/损坏存档）。 */
async function seed(storage: MemoryPlatform, raw: string): Promise<void> {
    await storage.set(IDLE_REWARDS_STORAGE_KEY, raw);
}

describe("Auto-battle fixture idle rewards wiring", () => {
    test("settles offline rewards from an injected wall clock", async () => {
        const idleClock = createIdleRewardClock(() => 0);
        const fixture = createAutoBattleFixture({ idleClock });

        idleClock.advance(300_000); // 5 分钟离线
        const settlement = fixture.idleRewards.settleOffline();

        // 默认速率固定：5 分钟 × DEFAULT_IDLE_RATE
        expect(settlement.minutes).toBe(5);
        expect(settlement.earned).toBeGreaterThan(0);
        expect(fixture.idleRewards.state.totalRewards).toBe(settlement.earned);
        await fixture.dispose();
    });

    test("does not settle rewards from battle simulation clock advance", async () => {
        const idleClock = createIdleRewardClock(() => 0);
        const fixture = createAutoBattleFixture({ idleClock });

        // 推进战斗模拟时钟不影响挂机收益（时间源解耦）
        fixture.clock.advance(1_000_000);
        expect(fixture.idleRewards.state.totalRewards).toBe(0);

        // 挂机墙钟独立推进才产生收益
        idleClock.advance(120_000);
        expect(fixture.idleRewards.settleOffline().earned).toBeGreaterThan(0);
        await fixture.dispose();
    });

    test("restore keeps accumulated rewards across a restart", async () => {
        const storage = new MemoryPlatform();

        // 直接写入状态（模拟上一次会话已结算并持久化）
        const clock = createIdleRewardClock(() => 0);
        const handle = createIdleRewardsHandle({ clock });
        handle.restore({ lastSeenAtMs: 0, totalRewards: 0, earnedAtMs: 0 });
        clock.advance(180_000);
        handle.settleOffline();
        const store = createIdleRewardsStore({ storage });
        await store.save(handle.state);

        // 新夹具 = 模拟重启；restore 后累计收益恢复
        const restarted = createAutoBattleFixture({ storage });
        await restarted.idleRewards.restore();
        expect(restarted.idleRewards.state.totalRewards).toBe(handle.state.totalRewards);
        await restarted.dispose();
    });

    test("settleOffline persists through the idle rewards store", async () => {
        const storage = new MemoryPlatform();
        const idleClock = createIdleRewardClock(() => 0);
        const fixture = createAutoBattleFixture({ storage, idleClock });

        idleClock.advance(60_000);
        fixture.idleRewards.settleOffline();

        const raw = await storage.get(IDLE_REWARDS_STORAGE_KEY);
        expect(raw).not.toBeNull();
        const record = JSON.parse(raw!) as {
            version: number;
            data: { lastSeenAtMs: number; totalRewards: number };
        };
        expect(record.version).toBe(1);
        expect(record.data.totalRewards).toBe(fixture.idleRewards.state.totalRewards);
        await fixture.dispose();
    });

    test("restore ignores a missing record and keeps the initial state", async () => {
        const fixture = createAutoBattleFixture({});
        await fixture.idleRewards.restore();
        expect(fixture.idleRewards.state.totalRewards).toBe(0);
        await fixture.dispose();
    });

    test("restore rejects a corrupted record with a diagnostic error", async () => {
        const storage = new MemoryPlatform();
        await seed(storage, "not-json");
        const fixture = createAutoBattleFixture({ storage });
        await expect(fixture.idleRewards.restore()).rejects.toThrow(/corrupted/);
        await fixture.dispose();
    });

    test("lineup read failure falls back to the default rate and does not block settlement", async () => {
        const storage = new MemoryPlatform();
        // 注入损坏的 lineup 存档：restoreLineup 读取时抛错，模拟编队读取失败
        await storage.set(
            `auto-battle:${encodeURIComponent("auto_battle")}:${encodeURIComponent("lineup")}`,
            "not-json",
        );
        const idleClock = createIdleRewardClock(() => 0);
        const fixture = createAutoBattleFixture({ storage, idleClock });

        // 编队读取失败以可诊断错误呈现（既有 restoreLineup 语义）
        await expect(fixture.lineup.restoreLineup()).rejects.toThrow(/corrupted/);

        // 但挂机结算不依赖编队读取：速率接缝独立，仍按默认速率正常结算
        idleClock.advance(120_000);
        const settlement = fixture.idleRewards.settleOffline();
        expect(settlement.minutes).toBe(2);
        expect(settlement.earned).toBeGreaterThan(0);
        await fixture.dispose();
    });
});
