import { describe, expect, test } from "bun:test";

import { createAutoBattlePresenter } from "../../../assets/samples/game_auto_battle/view/presenter";
import { AUTO_BATTLE_ASSEMBLY_EXISTS, loadCreateAutoBattleFixture, type AutoBattleState, type AutoBattleEvent } from "../support/auto-battle-fixture";

describe.skipIf(!AUTO_BATTLE_ASSEMBLY_EXISTS)("Auto-battle speed control (clock timeScale)", () => {
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

        fixture.clock.setTimeScale(0.5);
        fixture.clock.advance(100);
        expect(fixture.clock.now()).toBe(500);

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
});

describe.skipIf(!AUTO_BATTLE_ASSEMBLY_EXISTS)("Auto-battle speed control (cycle command)", () => {
    test("cycleSpeed cycles 1x -> 2x -> 3x -> 0.5x -> 1x and syncs the clock", async () => {
        const createAutoBattleFixture = await loadCreateAutoBattleFixture();
        const fixture = createAutoBattleFixture();
        await fixture.start();

        expect(fixture.getSpeed()).toBe(1);
        expect(fixture.clock.timeScale).toBe(1);

        fixture.cycleSpeed();
        expect(fixture.getSpeed()).toBe(2);
        expect(fixture.clock.timeScale).toBe(2);

        fixture.cycleSpeed();
        expect(fixture.getSpeed()).toBe(3);
        expect(fixture.clock.timeScale).toBe(3);

        fixture.cycleSpeed();
        expect(fixture.getSpeed()).toBe(0.5);
        expect(fixture.clock.timeScale).toBe(0.5);

        fixture.cycleSpeed();
        expect(fixture.getSpeed()).toBe(1);
        expect(fixture.clock.timeScale).toBe(1);

        await fixture.dispose();
    });

    test("the speed command updates the btn_speed title via VM", async () => {
        const createAutoBattleFixture = await loadCreateAutoBattleFixture();
        const fixture = createAutoBattleFixture();
        await fixture.start();

        fixture.viewModel.render();
        expect(fixture.viewModel.node("btn_speed").text).toBe("x1");

        fixture.cycleSpeed();
        fixture.viewModel.render();
        expect(fixture.viewModel.node("btn_speed").text).toBe("x2");

        fixture.cycleSpeed();
        fixture.viewModel.render();
        expect(fixture.viewModel.node("btn_speed").text).toBe("x3");

        fixture.cycleSpeed();
        fixture.viewModel.render();
        expect(fixture.viewModel.node("btn_speed").text).toBe("x0.5");

        await fixture.dispose();
    });
});

describe.skipIf(!AUTO_BATTLE_ASSEMBLY_EXISTS)("Auto-battle determinism across speed gears", () => {
    // 同一配置以不同 timeScale 时钟 + 相同 tick 序列驱动到终局，
    // 断言除 time 字段外的事件序列与终局结果完全一致（挡位不改变战斗结果）。
    const runToEnd = async (
        timeScale: number,
    ): Promise<{
        state: AutoBattleState;
        events: readonly AutoBattleEvent[];
    }> => {
        const createAutoBattleFixture = await loadCreateAutoBattleFixture();
        // 缺省 3v3 配置即玩家第一场战斗；布阵中线留空后默认数值下胜负为刀口平衡，
        // 此处只要求自然终局（result 确定），不同挡位下结果一致（挡位不改变战斗）
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

    test("0.5x / 1x / 2x / 3x produce identical event sequences (except time) and results", async () => {
        const half = await runToEnd(0.5);
        const one = await runToEnd(1);
        const two = await runToEnd(2);
        const three = await runToEnd(3);

        // 终局结果一致：全部挡位均自然终局且结果相同（不钉死胜方）
        expect(one.state.result).not.toBeUndefined();
        expect(half.state.result).toBe(one.state.result);
        expect(two.state.result).toBe(one.state.result);
        expect(three.state.result).toBe(one.state.result);

        // 事件数一致（时间戳随挡位变化，其余字段必须一致）
        expect(half.events.length).toBe(one.events.length);
        expect(two.events.length).toBe(one.events.length);
        expect(three.events.length).toBe(one.events.length);

        const withoutTime = (events: readonly AutoBattleEvent[]) => events.map(({ time: _time, ...rest }) => rest);
        expect(withoutTime(half.events)).toEqual(withoutTime(one.events));
        expect(withoutTime(two.events)).toEqual(withoutTime(one.events));
        expect(withoutTime(three.events)).toEqual(withoutTime(one.events));

        // 终局状态逐字段一致（time 只出现在事件，不进入状态）
        expect(half.state).toEqual(one.state);
        expect(two.state).toEqual(one.state);
        expect(three.state).toEqual(one.state);
    });
});

describe.skipIf(!AUTO_BATTLE_ASSEMBLY_EXISTS)("Auto-battle presenter drive timing (P0-4 regression)", () => {
    // 回归：挡位下模拟时钟推进只应用一次倍率。修复前 presenter 把已含 GameClock
    // 倍率的 delta 再传给 AutoBattleClock.advance（内部又乘一次 rate），事件时间戳
    // 按 speed² 膨胀；修复后传原始墙钟增量，推进量 = 墙钟增量 × 挡位（恰一次）。
    test("advances the simulation clock by the raw wall delta scaled once by the gear rate", async () => {
        const createAutoBattleFixture = await loadCreateAutoBattleFixture();
        const fixture = createAutoBattleFixture();
        await fixture.start();

        // 记录型视图节点：与 presenter 测试同模式；点击 speed 按钮走真实 cycleSpeed 链路
        const nodes = new Map<string, { clickHandler: (() => void) | undefined }>();
        const ensure = (name: string): { clickHandler: (() => void) | undefined } => {
            let recording = nodes.get(name);
            if (recording === undefined) {
                recording = { clickHandler: undefined };
                nodes.set(name, recording);
            }
            return recording;
        };
        const node = (name: string) => {
            const recording = ensure(name);
            return {
                setText: (_value: string) => undefined,
                setProgress: (_value: number) => undefined,
                setVisible: (_value: boolean) => undefined,
                setXY: (_x: number, _y: number) => undefined,
                setAlpha: (_value: number) => undefined,
                setUrl: (_value: string) => undefined,
                onClick: (handler: () => void) => {
                    recording.clickHandler = handler;
                },
            };
        };

        // 注入自增墙钟 + 手动驱动：确定性推进三阶段并进入战斗
        let wallTime = 0;
        let driver: (() => void) | undefined;
        const presenter = createAutoBattlePresenter(fixture, node, {
            now: () => wallTime,
            drive: (tick) => {
                driver = tick;
                return {
                    dispose: () => {
                        driver = undefined;
                    },
                };
            },
        });
        expect(driver).toBeDefined();

        // 2x 挡位：经 presenter 按钮命令同步 fixture 时钟与表现 GameClock 倍率
        nodes.get("btn_speed")?.clickHandler?.();
        expect(fixture.getSpeed()).toBe(2);

        // 每次推进 500ms 墙钟增量：VS(1000ms) → 入场(1750ms)。
        // 2x 下表现时钟每次 +1000：第 1 次驱动进入入场，第 2 次进入战斗（return 不推进），
        // 第 3 次起进入战斗块并首次推进模拟时钟：墙钟增量 500 × 挡位 2 = 1000（恰一次倍率；
        // 修复前为 500×2×2=2000，因为 delta 已含 GameClock 倍率又被 AutoBattleClock 乘一次）
        wallTime += 500;
        driver?.();
        wallTime += 500;
        driver?.();
        wallTime += 500;
        driver?.();
        expect(fixture.clock.now()).toBe(1000);

        // 第 4 次驱动再次推进：累计 1000+1000=2000（每次恰为 墙钟增量×挡位）
        wallTime += 500;
        driver?.();
        expect(fixture.clock.now()).toBe(2000);

        // 战斗按表现窗口逐行动推进，事件时间戳与模拟时钟一致
        expect(fixture.battle.events.length).toBeGreaterThan(0);
        for (const event of fixture.battle.events) {
            expect(event.time).toBeLessThanOrEqual(fixture.clock.now());
        }

        const eventCountAfterAction = fixture.battle.events.length;
        wallTime += 100;
        driver?.();
        expect(fixture.battle.events).toHaveLength(eventCountAfterAction);

        // 2x 下 500ms 墙钟对应 1000ms 表现时间，超过普通行动的 900ms 窗口后才推进下一人。
        wallTime += 400;
        driver?.();
        expect(fixture.battle.events.length).toBeGreaterThan(eventCountAfterAction);

        presenter.dispose();
        await fixture.dispose();
    });
});
