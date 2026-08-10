import { describe, expect, test } from "bun:test";

import {
    AUTO_BATTLE_ASSEMBLY_EXISTS,
    configContent,
    loadCreateAutoBattleFixture,
    unit,
} from "../support/auto-battle-fixture";

/** 构造一队 N 个低伤害单位：保证大规模对局以可预估轮次自然推进到终局。 */
function team(prefix: string, count: number): readonly Record<string, unknown>[] {
    return Array.from({ length: count }, (_, index) =>
        unit(`${prefix}${index}`, `${prefix}${index}`, {
            position: "front",
            maxHp: 100,
            attack: 1,
            speed: 10 - (index % 10),
            energyMax: 1000,
        }),
    );
}

describe.skipIf(!AUTO_BATTLE_ASSEMBLY_EXISTS)(
    "Auto-battle configurable scale",
    () => {
        test("1v1 parses and drives the battle to a terminal state", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: team("a", 1),
                    enemy: team("e", 1),
                }),
            });
            await fixture.start();

            // 1v1：双方各 1 单位，逻辑槽位从 0 开始
            expect(fixture.config.ally).toHaveLength(1);
            expect(fixture.config.enemy).toHaveLength(1);
            expect(fixture.battle.state.units.map((u) => u.index)).toEqual([0, 0]);

            let guard = 0;
            while (fixture.battle.state.phase === "fighting" && guard < 1000) {
                fixture.battle.tick();
                guard += 1;
            }
            expect(fixture.battle.state.phase).toBe("over");
            expect(guard).toBeLessThan(1000);

            await fixture.dispose();
        });

        test("5v5 parses and drives the battle to a terminal state", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: team("a", 5),
                    enemy: team("e", 5),
                }),
            });
            await fixture.start();

            expect(fixture.config.ally).toHaveLength(5);
            expect(fixture.config.enemy).toHaveLength(5);
            // 每队槽位 0..4，队内独立编号
            expect(fixture.battle.state.units.filter((u) => u.side === "ally").map((u) => u.index)).toEqual([0, 1, 2, 3, 4]);
            expect(fixture.battle.state.units.filter((u) => u.side === "enemy").map((u) => u.index)).toEqual([0, 1, 2, 3, 4]);

            let guard = 0;
            while (fixture.battle.state.phase === "fighting" && guard < 1000) {
                fixture.battle.tick();
                guard += 1;
            }
            expect(fixture.battle.state.phase).toBe("over");
            expect(guard).toBeLessThan(1000);

            await fixture.dispose();
        });

        test("6v6 parses and drives the battle to a terminal state", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: team("a", 6),
                    enemy: team("e", 6),
                }),
            });
            await fixture.start();

            expect(fixture.config.ally).toHaveLength(6);
            expect(fixture.config.enemy).toHaveLength(6);
            // 6v6 是全规模上限：每队槽位 0..5
            expect(fixture.battle.state.units.filter((u) => u.side === "ally").map((u) => u.index)).toEqual([0, 1, 2, 3, 4, 5]);
            expect(fixture.battle.state.units.filter((u) => u.side === "enemy").map((u) => u.index)).toEqual([0, 1, 2, 3, 4, 5]);

            let guard = 0;
            while (fixture.battle.state.phase === "fighting" && guard < 1000) {
                fixture.battle.tick();
                guard += 1;
            }
            expect(fixture.battle.state.phase).toBe("over");
            expect(guard).toBeLessThan(1000);

            await fixture.dispose();
        });

        test("a team above the max size is rejected at config parse", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();

            // 超上限（7 单位/队）配置解析拒绝，不产生战斗
            expect(() =>
                createAutoBattleFixture({
                    configContent: configContent({ ally: team("a", 7) }),
                }),
            ).toThrow(/at most 6 units/);
            expect(() =>
                createAutoBattleFixture({
                    configContent: configContent({ enemy: team("e", 7) }),
                }),
            ).toThrow(/at most 6 units/);
        });

        test("existing 3v3 configuration still parses and finishes as a win", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            // 3v3 是默认配置规模：回归确认放开上限后行为不变
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: team("a", 3),
                    enemy: team("e", 3),
                }),
            });
            await fixture.start();

            expect(fixture.config.ally).toHaveLength(3);
            expect(fixture.config.enemy).toHaveLength(3);

            let guard = 0;
            while (fixture.battle.state.phase === "fighting" && guard < 1000) {
                fixture.battle.tick();
                guard += 1;
            }
            expect(fixture.battle.state.phase).toBe("over");
            expect(fixture.battle.state.result).toBe("win");

            await fixture.dispose();
        });
    },
);
