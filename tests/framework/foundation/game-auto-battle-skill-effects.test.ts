import { describe, expect, test } from "bun:test";

import { createAutoBattleBattle } from "../../../assets/samples/game_auto_battle/logic/battle";
import { createAutoBattleClock } from "../../../assets/samples/game_auto_battle/logic/clock";
import { createAutoBattleConfig } from "../../../assets/samples/game_auto_battle/logic/config";

/**
 * 构造 1v1 配置：a 技能含多效果/条件/buff 引用，e 是受击目标（e 技能高能量门槛不会释放）。
 * 能量增长默认 10/受击 5：a 经多次普攻累积能量后施法。测试用状态驱动（tick 到目标
 * 状态），避免对行动时序的精确 tick 计数。
 */
function content(options: {
    readonly skill: Record<string, unknown>;
    readonly buffs?: readonly Record<string, unknown>[];
    readonly conditions?: readonly Record<string, unknown>[];
    readonly allyAttack?: number;
}): Record<string, unknown> {
    return {
        heroes: [
            { id: "a", name: "A", position: "front", maxHp: 100, attack: options.allyAttack ?? 5, speed: 5, energyMax: 50, skill: options.skill },
            { id: "e", name: "E", position: "front", maxHp: 100, attack: 1, speed: 4, energyMax: 100, skill: { id: "e-skill", name: "E Skill", kind: "damage", value: 10, energyCost: 1000 } },
        ],
        lineups: { ally: ["a"], enemy: ["e"] },
        energyGainAttacker: 10,
        energyGainTarget: 5,
        buffs: options.buffs ?? [],
        skillConditions: options.conditions ?? [],
    };
}

function createBattle(configContent: Record<string, unknown>) {
    const config = createAutoBattleConfig(configContent);
    const clock = createAutoBattleClock();
    const battle = createAutoBattleBattle({ clock, config });
    return { config, battle };
}

/** 驱动到谓词满足（带护栏防死循环）。 */
function tickUntil(battle: { readonly tick: () => void }, predicate: () => boolean): void {
    let guard = 0;
    while (!predicate() && guard < 100) {
        battle.tick();
        guard += 1;
    }
    expect(guard).toBeLessThan(100);
}

/** 单位快照便捷读取。 */
function unitOf(battle: { readonly state: { readonly units: readonly { readonly id: string }[] } }, id: string) {
    return battle.state.units.find((u) => u.id === id)!;
}

describe("Auto-battle multi-effect skills and buffs", () => {
    test("a damage skill with an attack-up buff effect applies both", () => {
        const { battle } = createBattle(
            content({
                skill: {
                    id: "s",
                    name: "Smash",
                    kind: "damage",
                    value: 30,
                    energyCost: 50,
                    effects: [
                        { kind: "damage", value: 30 },
                        { kind: "buff", value: 0, buffId: "attack-up" },
                    ],
                },
                buffs: [{ id: "attack-up", name: "攻击强化", kind: "attack-up", value: 2, duration: 2 }],
            }),
        );

        // 驱动到 a 释放技能：目标挂 attack-up（挂载瞬间 remaining=2）
        tickUntil(battle, () => unitOf(battle, "e").buffs.some((b) => b.def.id === "attack-up"));
        const enemy = unitOf(battle, "e");
        const ally = unitOf(battle, "a");
        expect(enemy.buffs[0]?.remaining).toBe(2);
        // 技能伤害 30 已结算（目标受击 30 + 前期普攻）
        expect(enemy.hp).toBeLessThan(100);
        expect(ally.energy).toBe(0);

        battle.dispose();
    });

    test("attack-up buff boosts the holder's damage output and expires", () => {
        const { battle } = createBattle(
            content({
                skill: {
                    id: "s",
                    name: "Smash",
                    kind: "damage",
                    value: 30,
                    energyCost: 50,
                    effects: [
                        { kind: "damage", value: 30 },
                        { kind: "buff", value: 0, buffId: "attack-up" },
                    ],
                },
                buffs: [{ id: "attack-up", name: "攻击强化", kind: "attack-up", value: 2, duration: 2 }],
            }),
        );

        // 挂载后继续驱动到到期移除
        tickUntil(battle, () => unitOf(battle, "e").buffs.some((b) => b.def.id === "attack-up"));
        tickUntil(battle, () => unitOf(battle, "e").buffs.length === 0);
        expect(unitOf(battle, "e").buffs).toHaveLength(0);
        // e 攻击事件：buff 生效期间打出 1+2=3，到期后回退 1
        const eAttacks = battle.events.filter((ev) => ev.type === "attack" && ev.sourceId === "e").map((ev) => ev.value);
        expect(eAttacks).toContain(3);
        expect(eAttacks).toContain(1);

        battle.dispose();
    });

    test("defense-up buff on self reduces incoming damage", () => {
        const { battle } = createBattle(
            content({
                skill: {
                    id: "s",
                    name: "Shield",
                    kind: "damage",
                    value: 0,
                    energyCost: 50,
                    target: "self",
                    effects: [{ kind: "buff", value: 0, buffId: "defense-up" }],
                },
                buffs: [{ id: "defense-up", name: "防御强化", kind: "defense-up", value: 2, duration: 2 }],
            }),
        );

        // 驱动到 a 挂上防御 buff，并推进至少一次敌方攻击（防御应减伤）
        tickUntil(battle, () => unitOf(battle, "a").buffs.some((b) => b.def.id === "defense-up"));
        const hpAtBuff = unitOf(battle, "a").hp;
        // 再推进：期间 a 受击 1 点被防御 2 抵消，HP 不下降（除非施法者自身行动无伤）
        const before = battle.events.length;
        let guard = 0;
        while (!battle.events.slice(before).some((ev) => ev.type === "attack" && ev.targetId === "a") && guard < 20) {
            battle.tick();
            guard += 1;
        }
        expect(unitOf(battle, "a").hp).toBe(hpAtBuff);

        battle.dispose();
    });

    test("damage-over-time buff ticks each round and expires", () => {
        const { battle } = createBattle(
            content({
                skill: {
                    id: "s",
                    name: "Poison",
                    kind: "damage",
                    value: 0,
                    energyCost: 50,
                    effects: [{ kind: "buff", value: 0, buffId: "poison" }],
                },
                // 施法者攻击 0：普攻不造成伤害，便于只观察 DoT
                allyAttack: 0,
                buffs: [{ id: "poison", name: "中毒", kind: "damage-over-time", value: 2, duration: 3 }],
            }),
        );

        // 挂毒：目标满血
        tickUntil(battle, () => unitOf(battle, "e").buffs.some((b) => b.def.id === "poison"));
        expect(unitOf(battle, "e").hp).toBe(100);

        // 毒 tick 3 次（duration 3）：每轮 2 点 → 94；到期移除
        tickUntil(battle, () => unitOf(battle, "e").buffs.length === 0);
        const after = unitOf(battle, "e");
        expect(after.hp).toBe(94);
        expect(after.buffs).toHaveLength(0);

        battle.dispose();
    });

    test("a skill with an unsatisfied condition degrades to a basic attack", () => {
        const { battle } = createBattle(
            content({
                skill: {
                    id: "s",
                    name: "Desperate",
                    kind: "damage",
                    value: 40,
                    energyCost: 50,
                    effects: [{ kind: "damage", value: 40 }],
                    conditionId: "self-hp-below-half",
                },
                conditions: [{ id: "self-hp-below-half", kind: "self-hp-ratio", value: 0.5 }],
            }),
        );

        // 驱动到 a 满能量（hp 仍 100/100 不满足条件）→ 行动应退化为普攻而非技能
        tickUntil(battle, () => unitOf(battle, "a").energy >= unitOf(battle, "a").energyMax);
        const before = battle.events.length;
        let guard = 0;
        while (!battle.events.slice(before).some((ev) => ev.type === "attack" && ev.sourceId === "a") && guard < 10) {
            battle.tick();
            guard += 1;
        }
        // 普攻造成 5 点伤害（非技能 40），且无技能事件
        const enemy = unitOf(battle, "e");
        expect(enemy.hp).toBeLessThan(100);
        expect(battle.events.some((e) => e.type === "skill-damage")).toBe(false);

        battle.dispose();
    });
});

describe("Auto-battle skill condition helpers", () => {
    test("condition table is exposed on the config handle", () => {
        const { config } = createBattle(
            content({
                skill: { id: "s", name: "S", kind: "damage", value: 1, energyCost: 50 },
                conditions: [{ id: "always", kind: "always" }],
            }),
        );
        expect(config.skillConditions.map((c) => c.id)).toEqual(["always"]);
    });
});
