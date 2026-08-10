import { describe, expect, test } from "bun:test";

import {
    AUTO_BATTLE_ASSEMBLY_EXISTS,
    loadCreateAutoBattleFixture,
    type AutoBattleState,
    type AutoBattleEvent,
} from "../support/auto-battle-fixture";

describe.skipIf(!AUTO_BATTLE_ASSEMBLY_EXISTS)(
    "Auto-battle speed control (clock timeScale)",
    () => {
        test("advance scales the simulated time by the timeScale rate", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture();
            await fixture.start();

            expect(fixture.clock.timeScale).toBe(1);
            fixture.clock.advance(100);
            expect(fixture.clock.now()).toBe(100);

            fixture.clock.setTimeScale(2);
            expect(fixture.clock.timeScale).toBe(2);
            fixture.clock.advance(100);
            // 2x 下推进量翻倍：100 + 100*2
            expect(fixture.clock.now()).toBe(300);

            fixture.clock.setTimeScale(3);
            fixture.clock.advance(50);
            expect(fixture.clock.now()).toBe(450);

            await fixture.dispose();
        });

        test("setTimeScale rejects non-finite and non-positive rates", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture();
            await fixture.start();

            for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
                expect(() => fixture.clock.setTimeScale(bad)).toThrow();
            }
            // 非法设置不改变当前倍率
            expect(fixture.clock.timeScale).toBe(1);

            await fixture.dispose();
        });

        test("default timeScale 1 keeps advance behavior unchanged", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture();
            await fixture.start();

            fixture.clock.advance(250);
            expect(fixture.clock.now()).toBe(250);

            await fixture.dispose();
        });
    },
);

describe.skipIf(!AUTO_BATTLE_ASSEMBLY_EXISTS)(
    "Auto-battle speed control (cycle command)",
    () => {
        test("cycleSpeed cycles 1x -> 2x -> 3x -> 1x and syncs the clock", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture();
            await fixture.start();

            expect(fixture.speed).toBe(1);
            expect(fixture.clock.timeScale).toBe(1);

            fixture.cycleSpeed();
            expect(fixture.speed).toBe(2);
            expect(fixture.clock.timeScale).toBe(2);

            fixture.cycleSpeed();
            expect(fixture.speed).toBe(3);
            expect(fixture.clock.timeScale).toBe(3);

            fixture.cycleSpeed();
            expect(fixture.speed).toBe(1);
            expect(fixture.clock.timeScale).toBe(1);

            await fixture.dispose();
        });

        test("the speed command updates the txt_speed binding via VM", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture();
            await fixture.start();

            fixture.viewModel.render();
            expect(fixture.viewModel.node("txt_speed").text).toBe("x1");

            fixture.cycleSpeed();
            fixture.viewModel.render();
            expect(fixture.viewModel.node("txt_speed").text).toBe("x2");

            fixture.cycleSpeed();
            fixture.viewModel.render();
            expect(fixture.viewModel.node("txt_speed").text).toBe("x3");

            await fixture.dispose();
        });
    },
);

describe.skipIf(!AUTO_BATTLE_ASSEMBLY_EXISTS)(
    "Auto-battle determinism across speed gears",
    () => {
        // 同一配置以不同 timeScale 时钟 + 相同 tick 序列驱动到终局，
        // 断言除 time 字段外的事件序列与终局结果完全一致（挡位不改变战斗结果）。
        const runToEnd = async (timeScale: number): Promise<{
            state: AutoBattleState;
            events: readonly AutoBattleEvent[];
        }> => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            // 缺省 3v3 配置即玩家第一场战斗（已锁定自然终局为胜利），
            // 用同一缺省配置验证不同挡位下的确定性
            const fixture = createAutoBattleFixture();
            await fixture.start();
            // 挡位只改模拟时钟倍率：不同挡位下 tick 序列相同（每 tick 一个行动）
            fixture.clock.setTimeScale(timeScale);

            let guard = 0;
            while (fixture.battle.state.phase === "fighting" && guard < 1000) {
                fixture.battle.tick();
                guard += 1;
            }
            const state = fixture.battle.state;
            const events = fixture.battle.events;
            await fixture.dispose();
            return { state, events };
        };

        test("1x / 2x / 3x produce identical event sequences (except time) and results", async () => {
            const one = await runToEnd(1);
            const two = await runToEnd(2);
            const three = await runToEnd(3);

            // 终局结果一致：三种挡位均自然终局且同为胜利
            expect(one.state.result).toBe("win");
            expect(two.state.result).toBe("win");
            expect(three.state.result).toBe("win");

            // 事件数一致（时间戳随挡位变化，其余字段必须一致）
            expect(two.events.length).toBe(one.events.length);
            expect(three.events.length).toBe(one.events.length);

            const withoutTime = (events: readonly AutoBattleEvent[]) =>
                events.map(({ time: _time, ...rest }) => rest);
            expect(withoutTime(two.events)).toEqual(withoutTime(one.events));
            expect(withoutTime(three.events)).toEqual(withoutTime(one.events));

            // 终局状态逐字段一致（time 只出现在事件，不进入状态）
            expect(two.state).toEqual(one.state);
            expect(three.state).toEqual(one.state);
        });
    },
);
