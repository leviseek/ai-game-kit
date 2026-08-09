import { describe, expect, test } from "bun:test";

import {
    AUTO_BATTLE_ASSEMBLY_EXISTS,
    configContent,
    loadCreateAutoBattleFixture,
    unit,
} from "../support/auto-battle-fixture";

describe.skipIf(!AUTO_BATTLE_ASSEMBLY_EXISTS)(
    "Auto-battle action mechanics",
    () => {
        test("a round advances after every alive unit has acted once", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            // 6 存活单位全部普攻不致死（低攻击高 HP），保证一轮内无人阵亡
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: [
                        unit("a0", "Tank", { position: "front", maxHp: 100, attack: 1, speed: 6, energyMax: 1000 }),
                        unit("a1", "Mage", { position: "mid", maxHp: 100, attack: 1, speed: 5, energyMax: 1000 }),
                        unit("a2", "Priest", { position: "back", maxHp: 100, attack: 1, speed: 4, energyMax: 1000 }),
                    ],
                    enemy: [
                        unit("e0", "Grunt", { position: "front", maxHp: 100, attack: 1, speed: 3, energyMax: 1000 }),
                        unit("e1", "Raider", { position: "mid", maxHp: 100, attack: 1, speed: 2, energyMax: 1000 }),
                        unit("e2", "Shaman", { position: "back", maxHp: 100, attack: 1, speed: 1, energyMax: 1000 }),
                    ],
                }),
            });
            await fixture.start();

            // 6 单位各行动一次后序列耗尽，仍未进入下一回合
            for (let index = 0; index < 6; index += 1) {
                fixture.battle.tick();
            }
            expect(fixture.battle.state.round).toBe(1);

            // 序列耗尽后的下一次 tick 进入第 2 回合并按存活单位重建序列
            fixture.battle.tick();
            expect(fixture.battle.state.round).toBe(2);

            await fixture.dispose();
        });

        test("the action order is speed-descending and equal speeds stay stable", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: [
                        unit("slow", "Slow", { position: "front", maxHp: 100, attack: 1, speed: 1, energyMax: 1000 }),
                    ],
                    enemy: [
                        unit("fast", "Fast", { position: "front", maxHp: 100, attack: 1, speed: 9, energyMax: 1000 }),
                        unit("mid", "Mid", { position: "mid", maxHp: 100, attack: 1, speed: 5, energyMax: 1000 }),
                    ],
                }),
            });
            await fixture.start();

            // 初始行动序列按速度降序：fast(9) → mid(5) → slow(1)
            expect(fixture.battle.state.order).toEqual(["fast", "mid", "slow"]);

            await fixture.dispose();
        });

        test("equal speeds keep a deterministic stable order", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: [unit("a", "A", { maxHp: 100, attack: 1, speed: 5, energyMax: 1000 })],
                    enemy: [
                        unit("b", "B", { maxHp: 100, attack: 1, speed: 5, energyMax: 1000 }),
                        unit("c", "C", { maxHp: 100, attack: 1, speed: 5, energyMax: 1000 }),
                    ],
                }),
            });
            await fixture.start();

            // 同速：先己方后敌方、再队内阵列序号，顺序固定可预期
            expect(fixture.battle.state.order).toEqual(["a", "b", "c"]);

            await fixture.dispose();
        });

        test("units that die mid-round are skipped without damage or events", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: [
                        unit("a", "A", { position: "front", maxHp: 5, attack: 1, speed: 5, energyMax: 1000 }),
                        unit("b", "B", { position: "mid", maxHp: 100, attack: 1, speed: 3, energyMax: 1000 }),
                    ],
                    enemy: [
                        unit("x", "X", { position: "front", maxHp: 100, attack: 5, speed: 9, energyMax: 1000 }),
                        unit("y", "Y", { position: "mid", maxHp: 100, attack: 1, speed: 4, energyMax: 1000 }),
                    ],
                }),
            });
            await fixture.start();

            fixture.battle.tick(); // x 先手击杀 a（前排）
            const dead = fixture.battle.state.units.find((u) => u.id === "a");
            expect(dead?.hp).toBe(0);
            // 阵亡目标不结算受击能量（实现收窄锁定）
            expect(dead?.energy).toBe(0);

            const afterKill = fixture.battle.events.length;
            fixture.battle.tick(); // a 本轮已阵亡：行动跳过，不产生伤害或事件
            expect(fixture.battle.events.length).toBe(afterKill);
            expect(fixture.battle.state.units.find((u) => u.id === "a")?.hp).toBe(0);
            expect(fixture.battle.state.units.find((u) => u.id === "a")?.energy).toBe(0);

            await fixture.dispose();
        });

        test("a basic attack deals attack damage and grows energy per the rules", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: [unit("a", "A", { position: "front", maxHp: 100, attack: 10, speed: 5, energyMax: 100 })],
                    enemy: [unit("x", "X", { position: "front", maxHp: 100, attack: 1, speed: 4, energyMax: 100 })],
                    energyGainAttacker: 10,
                    energyGainTarget: 5,
                }),
            });
            await fixture.start();

            fixture.battle.tick(); // a 普攻 x
            let a = fixture.battle.state.units.find((u) => u.id === "a");
            let x = fixture.battle.state.units.find((u) => u.id === "x");
            expect(x?.hp).toBe(90);
            expect(a?.energy).toBe(10);
            expect(x?.energy).toBe(5);

            fixture.battle.tick(); // x 普攻 a
            a = fixture.battle.state.units.find((u) => u.id === "a");
            x = fixture.battle.state.units.find((u) => u.id === "x");
            expect(a?.hp).toBe(99);
            expect(a?.energy).toBe(15); // 攻击 10 + 受击 5
            expect(x?.energy).toBe(15); // 受击 5 + 攻击 10

            await fixture.dispose();
        });

        test("a unit with full energy releases a damage skill instead of attacking", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: [unit("a", "A", {
                        position: "front",
                        maxHp: 100,
                        attack: 5,
                        speed: 5,
                        energyMax: 50,
                        skill: { id: "a-s", name: "Smash", kind: "damage", value: 30, energyCost: 50 },
                    })],
                    enemy: [unit("x", "X", { position: "front", maxHp: 100, attack: 1, speed: 4, energyMax: 100 })],
                    energyGainAttacker: 50,
                    energyGainTarget: 5,
                }),
            });
            await fixture.start();

            fixture.battle.tick(); // a 普攻 x：能量 0 → 50
            expect(fixture.battle.state.units.find((u) => u.id === "x")?.hp).toBe(95);

            fixture.battle.tick(); // x 普攻 a：a 能量 50+5 → 上限 50
            fixture.battle.tick(); // 第 2 回合 a 满能量 → 释放伤害技能

            const x = fixture.battle.state.units.find((u) => u.id === "x");
            const a = fixture.battle.state.units.find((u) => u.id === "a");
            expect(x?.hp).toBe(65); // 95 - skill 30
            expect(a?.energy).toBe(0);

            const skillEvents = fixture.battle.events.filter(
                (e) => e.type === "skill-damage",
            );
            expect(skillEvents).toHaveLength(1);
            expect(skillEvents[0]?.value).toBe(30);
            expect(skillEvents[0]?.targetId).toBe("x");

            await fixture.dispose();
        });

        test("a unit with full energy releases a heal skill on the lowest-hp ally", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: [
                        unit("a", "A", {
                            position: "back",
                            maxHp: 100,
                            attack: 1,
                            speed: 5,
                            energyMax: 50,
                            skill: { id: "a-s", name: "Mend", kind: "heal", value: 3, energyCost: 50 },
                        }),
                        unit("b", "B", { position: "front", maxHp: 10, attack: 1, speed: 3, energyMax: 50 }),
                    ],
                    enemy: [unit("x", "X", { position: "front", maxHp: 100, attack: 5, speed: 4, energyMax: 100 })],
                    energyGainAttacker: 50,
                    energyGainTarget: 5,
                }),
            });
            await fixture.start();

            fixture.battle.tick(); // a 普攻 x：能量 0 → 50
            fixture.battle.tick(); // x 攻击前排 b：b hp 10 → 5
            fixture.battle.tick(); // b 普攻 x
            fixture.battle.tick(); // 第 2 回合 a 满能量 → 治疗 HP 比例最低的存活己方 b

            const b = fixture.battle.state.units.find((u) => u.id === "b");
            const a = fixture.battle.state.units.find((u) => u.id === "a");
            expect(b?.hp).toBe(8); // 5 + heal 3
            expect(a?.energy).toBe(0);

            const healEvents = fixture.battle.events.filter(
                (e) => e.type === "skill-heal",
            );
            expect(healEvents).toHaveLength(1);
            expect(healEvents[0]?.targetId).toBe("b");
            expect(healEvents[0]?.value).toBe(3);

            await fixture.dispose();
        });

        test("target selection prefers the front row and falls back as rows die", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const attacks: string[] = [];
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: [unit("a", "A", { position: "front", maxHp: 200, attack: 50, speed: 10, energyMax: 1000 })],
                    enemy: [
                        unit("x", "X", { position: "front", maxHp: 20, attack: 1, speed: 1, energyMax: 1000 }),
                        unit("y", "Y", { position: "mid", maxHp: 100, attack: 1, speed: 1, energyMax: 1000 }),
                        unit("z", "Z", { position: "back", maxHp: 100, attack: 1, speed: 1, energyMax: 1000 }),
                    ],
                }),
                onEvent: (event) => {
                    if (
                        event.type === "attack" &&
                        event.sourceId === "a" &&
                        event.targetId !== undefined
                    ) {
                        attacks.push(event.targetId);
                    }
                },
            });
            await fixture.start();

            let guard = 0;
            while (attacks.length < 4 && guard < 200) {
                fixture.battle.tick();
                guard += 1;
            }

            // 目标顺延：前排 x → 中排 y → 后排 z；x 一次击杀、y 两次击杀
            expect(attacks).toEqual(["x", "y", "y", "z"]);

            await fixture.dispose();
        });
    },
);
