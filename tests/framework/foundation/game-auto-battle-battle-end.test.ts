import { describe, expect, test } from "bun:test";

import { AUTO_BATTLE_ASSEMBLY_EXISTS, configContent, loadCreateAutoBattleFixture, type AutoBattleState, unit } from "../support/auto-battle-fixture";

describe.skipIf(!AUTO_BATTLE_ASSEMBLY_EXISTS)("Auto-battle terminal states and determinism", () => {
    test("wiping the enemy ends the battle as a win", async () => {
        const createAutoBattleFixture = await loadCreateAutoBattleFixture();
        const fixture = createAutoBattleFixture({
            configContent: configContent({
                ally: [unit("a", "A", { position: "front", maxHp: 100, attack: 20, speed: 10, energyMax: 1000 })],
                enemy: [unit("x", "X", { position: "front", maxHp: 10, attack: 1, speed: 1, energyMax: 1000 })],
            }),
        });
        await fixture.start();

        for (let guard = 0; guard < 10 && fixture.battle.state.phase === "fighting"; guard += 1) {
            fixture.battle.tick();
        }

        const state = fixture.battle.state;
        expect(state.phase).toBe("over");
        expect(state.result).toBe("win");

        await fixture.dispose();
    });

    test("losing all allies ends the battle as a loss", async () => {
        const createAutoBattleFixture = await loadCreateAutoBattleFixture();
        const fixture = createAutoBattleFixture({
            configContent: configContent({
                ally: [unit("a", "A", { position: "front", maxHp: 10, attack: 1, speed: 1, energyMax: 1000 })],
                enemy: [unit("x", "X", { position: "front", maxHp: 100, attack: 20, speed: 10, energyMax: 1000 })],
            }),
        });
        await fixture.start();

        for (let guard = 0; guard < 10 && fixture.battle.state.phase === "fighting"; guard += 1) {
            fixture.battle.tick();
        }

        const state = fixture.battle.state;
        expect(state.phase).toBe("over");
        expect(state.result).toBe("lose");

        await fixture.dispose();
    });

    test("tick is a no-op after the battle ends", async () => {
        const createAutoBattleFixture = await loadCreateAutoBattleFixture();
        const fixture = createAutoBattleFixture({
            configContent: configContent({
                enemy: [unit("x", "X", { maxHp: 10, attack: 1, speed: 1 })],
            }),
        });
        await fixture.start();

        for (let guard = 0; guard < 10 && fixture.battle.state.phase === "fighting"; guard += 1) {
            fixture.battle.tick();
        }
        expect(fixture.battle.state.result).toBe("win");

        const before = fixture.battle.events.length;
        const snapshot = fixture.battle.state;
        fixture.battle.tick();
        fixture.battle.tick();

        // 终局后推进不产生事件、状态不变
        expect(fixture.battle.events.length).toBe(before);
        expect(fixture.battle.state).toEqual(snapshot);

        await fixture.dispose();
    });

    test("events replay in a deterministic order", async () => {
        const createAutoBattleFixture = await loadCreateAutoBattleFixture();
        const fixture = createAutoBattleFixture({
            configContent: configContent({
                // 射程 4 使开局即命中（布阵前排间距 4 列），聚焦无移动的普攻击杀序列
                ally: [unit("a", "A", { attackRange: 4 })],
                enemy: [unit("x", "X", { maxHp: 10, attack: 1, speed: 1 })],
            }),
        });
        await fixture.start();

        fixture.battle.tick(); // a 一击击杀 x → 终局

        // 1v1 默认布阵（敌列 3、己列 7）manhattan 距离 4 ≤ attackRange 4：
        // 射程内直接普攻，不产生 move 事件（移动 + 普攻两阶段由 unit-motion 专项覆盖）
        const types = fixture.battle.events.map((e) => e.type);
        expect(types).toEqual(["round-start", "attack", "unit-dead", "battle-over"]);
        const over = fixture.battle.events[fixture.battle.events.length - 1];
        expect(over?.result).toBe("win");

        await fixture.dispose();
    });

    test("two runs with identical inputs produce identical states", async () => {
        const createAutoBattleFixture = await loadCreateAutoBattleFixture();
        const run = async (): Promise<AutoBattleState> => {
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: [
                        unit("a0", "Tank", { position: "front", maxHp: 60, attack: 6, speed: 8, energyMax: 20, skill: { id: "a0-s", name: "Smash", kind: "damage", value: 12, energyCost: 20 } }),
                        unit("a1", "Mage", { position: "mid", maxHp: 45, attack: 9, speed: 7, energyMax: 20, skill: { id: "a1-s", name: "Bolt", kind: "damage", value: 15, energyCost: 20 } }),
                        unit("a2", "Priest", { position: "back", maxHp: 40, attack: 4, speed: 6, energyMax: 20, skill: { id: "a2-s", name: "Mend", kind: "heal", value: 10, energyCost: 20 } }),
                    ],
                    enemy: [
                        unit("e0", "Grunt", { position: "front", maxHp: 60, attack: 6, speed: 8, energyMax: 20, skill: { id: "e0-s", name: "Claw", kind: "damage", value: 12, energyCost: 20 } }),
                        unit("e1", "Raider", { position: "mid", maxHp: 45, attack: 9, speed: 7, energyMax: 20, skill: { id: "e1-s", name: "Swipe", kind: "damage", value: 15, energyCost: 20 } }),
                        unit("e2", "Shaman", { position: "back", maxHp: 40, attack: 4, speed: 6, energyMax: 20, skill: { id: "e2-s", name: "Hex", kind: "damage", value: 8, energyCost: 20 } }),
                    ],
                    energyGainAttacker: 10,
                    energyGainTarget: 5,
                }),
            });
            await fixture.start();

            let guard = 0;
            while (fixture.battle.state.phase === "fighting" && guard < 1000) {
                fixture.battle.tick();
                guard += 1;
            }
            const state = fixture.battle.state;
            await fixture.dispose();
            return state;
        };

        const first = await run();
        const second = await run();

        // 确定性：两次独立运行终局状态逐字段一致，且战斗自然终局
        expect(first).toEqual(second);
        expect(first.result).not.toBeUndefined();

        // 双方单位不重叠 id 且合计 6 单位（3v3 静态槽位）
        const ids = first.units.map((u) => u.id);
        expect(new Set(ids).size).toBe(6);
    });
});
