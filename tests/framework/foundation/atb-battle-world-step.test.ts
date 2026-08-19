import { describe, expect, test } from "bun:test";

import { BattleFactory } from "../../../assets/atb/battle/factory/BattleFactory";
import { TestBattle } from "../../../assets/atb/battle/data/battles/TestBattleData";

/**
 * BattleWorld 推进语义锁：update 受调度器 playing 门禁，step 强制推进且不改变状态。
 * 回归保护：step 的 force 参数曾因整理被误删，导致暂停态单步静默失效。
 * 初始数据：hero_knight energy=60（regen 10/s）、enemy_001 energy=100（满）。
 */
function createWorld() {
    return BattleFactory.create(TestBattle);
}

describe("BattleWorld 推进语义", () => {
    test("暂停时 update 不推进，step 强制推进（时钟与能量）", () => {
        const world = createWorld();
        const hero = world.getUnit("hero_knight");
        world.scheduler.pause();
        const t0 = world.getTime();
        world.update(1);
        expect(world.getTime()).toBe(t0); // playing 门禁拦截
        world.step(1);
        expect(world.getTime()).toBe(t0 + 1);
        expect(hero?.energy).toBe(70); // 60 + 10 * 1
    });

    test("step 不改变 playing 状态", () => {
        const world = createWorld();
        world.scheduler.pause();
        world.step(1);
        expect(world.scheduler.isPlaying()).toBe(false);
    });

    test("playing 时 update 正常推进", () => {
        const world = createWorld();
        world.scheduler.start();
        const t0 = world.getTime();
        world.update(1);
        expect(world.getTime()).toBe(t0 + 1);
    });

    test("暂停态连续 step 确定性累计", () => {
        const world = createWorld();
        world.scheduler.pause();
        world.step(1);
        world.step(1);
        expect(world.getTime()).toBe(2);
    });
});
