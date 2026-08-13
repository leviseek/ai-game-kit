import { describe, expect, test } from "bun:test";

import { createAutoBattleBattle, type AutoBattleLineupPair } from "../../../assets/samples/game_auto_battle/logic/battle";
import { createAutoBattleClock } from "../../../assets/samples/game_auto_battle/logic/clock";
import { createAutoBattleConfig, type AutoBattleConfigHandle } from "../../../assets/samples/game_auto_battle/logic/config";
import type { AutoBattleState } from "../../../assets/samples/game_auto_battle/models";

/** 构造英雄池条目（heroes 格式）。 */
function hero(id: string, name: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id,
        name,
        position: "front",
        maxHp: 100,
        attack: 10,
        speed: 5,
        energyMax: 100,
        skill: {
            id: `${id}-skill`,
            name: `${name} Skill`,
            kind: "damage",
            value: 40,
            energyCost: 100,
        },
        ...overrides,
    };
}

/** 构造 heroes + lineups 格式配置：双方编队引用池内 heroId。 */
function lineupContent(ally: readonly string[], enemy: readonly string[]): Record<string, unknown> {
    const heroes = [...ally, ...enemy].map((id) => hero(id, id));
    return {
        heroes,
        lineups: { ally: [...ally], enemy: [...enemy] },
        energyGainAttacker: 10,
        energyGainTarget: 5,
    };
}

/** 直接构造 battle（不经 fixture），便于聚焦开战实例化行为。 */
function createBattle(configContent: Record<string, unknown>): {
    readonly config: AutoBattleConfigHandle;
    readonly state: () => AutoBattleState;
    readonly events: () => readonly {
        type: string;
        sourceId: string;
        targetId?: string;
    }[];
    readonly tick: () => void;
    readonly restart: () => void;
    readonly dispose: () => void;
} {
    const config = createAutoBattleConfig(configContent);
    const clock = createAutoBattleClock();
    const battle = createAutoBattleBattle({ clock, config });
    return {
        config,
        state: () => battle.state,
        events: () => battle.events,
        tick: () => battle.tick(),
        restart: () => battle.restart(),
        dispose: () => battle.dispose(),
    };
}

describe("Auto-battle target lock", () => {
    test("first attack locks the front-row target", () => {
        // 敌方前排 ef 存活：ally 首次行动锁定 ef，后续行动持续攻击它
        const battle = createBattle(lineupContent(["a"], ["ef", "eb"]));
        battle.tick();
        const ally = battle.state().units.find((u) => u.side === "ally")!;
        expect(ally.lockedTargetId).toBe("ef");
        expect(battle.events().find((e) => e.type === "attack")?.targetId).toBe("ef");
        battle.dispose();
    });

    test("locked target is kept while alive", () => {
        // 锁定目标存活期间，ally 后续行动持续攻击同一目标（不因重新按前排选择而漂移）。
        // 当前战斗无换位/生成，锁定目标必为前排存活者；"更靠前目标出现"的换向场景
        // 由 resolveAutoBattleTarget 的锁定优先分支保证，此处验证存活期间锁定不松动。
        const battle = createBattle(lineupContent(["a"], ["aef"]));
        battle.tick();
        expect(battle.state().units.find((u) => u.side === "ally")!.lockedTargetId).toBe("aef");
        for (let i = 0; i < 6; i += 1) {
            battle.tick();
        }
        expect(battle.state().units.find((u) => u.side === "ally")!.lockedTargetId).toBe("aef");
        // 攻击落点也持续为锁定目标：a 的每次普攻 targetId 都是 aef（不含敌方回击 a 的事件）
        const attacks = battle
            .events()
            .filter((e) => e.type === "attack" && e.sourceId === "a")
            .map((e) => e.targetId);
        expect(attacks.length).toBeGreaterThan(0);
        expect(attacks.every((targetId) => targetId === "aef")).toBe(true);
        battle.dispose();
    });

    test("locked target death falls back to front-row reselection", () => {
        // 敌方前排 ef 被秒杀后，ally 下一行动顺延锁定后排 eb
        const battle = createBattle({
            heroes: [hero("a", "a", { attack: 200 }), hero("ef", "ef"), hero("eb", "eb", { position: "back" })],
            lineups: { ally: ["a"], enemy: ["ef", "eb"] },
            energyGainAttacker: 10,
            energyGainTarget: 5,
        });
        // tick1: a 行动秒杀 ef（锁定 ef）；tick2: ef 阵亡跳过；tick3: eb 行动；
        // tick4: 轮次+1；tick5: a 行动时 ef 已死 → 顺延锁定 eb
        for (let i = 0; i < 5; i += 1) {
            battle.tick();
        }
        expect(battle.events().some((e) => e.type === "unit-dead")).toBe(true);
        expect(battle.state().units.find((u) => u.side === "ally")!.lockedTargetId).toBe("eb");
        battle.dispose();
    });

    test("skill kill of the locked target falls back on the next action", () => {
        // 满能量伤害技能秒杀锁定目标后，下一行动顺延锁定后排（技能分支的重选路径）
        const battle = createBattle({
            heroes: [
                hero("a", "a", {
                    attack: 0,
                    skill: {
                        id: "smash",
                        name: "Smash",
                        kind: "damage",
                        value: 200,
                        energyCost: 1,
                    },
                }),
                hero("ef", "ef"),
                hero("eb", "eb", { position: "back" }),
            ],
            lineups: { ally: ["a"], enemy: ["ef", "eb"] },
            energyGainAttacker: 10,
            energyGainTarget: 5,
        });
        // tick1: a 普攻（能量不足技能）锁定 ef，能量+10；tick2/3: ef、eb 行动；
        // tick4: 轮次+1；tick5: a 满能量释放技能秒杀 ef（skill-damage + unit-dead）
        // tick6: ef 阵亡跳过；tick7: eb 行动；tick8: 轮次+1；tick9: a 行动顺延锁定 eb
        for (let i = 0; i < 9; i += 1) {
            battle.tick();
        }
        expect(battle.events().some((e) => e.type === "skill-damage")).toBe(true);
        expect(battle.events().some((e) => e.type === "unit-dead")).toBe(true);
        expect(battle.state().units.find((u) => u.side === "ally")!.lockedTargetId).toBe("eb");
        battle.dispose();
    });

    test("locked target killed by another ally falls back in the same round", () => {
        // 2v1：b（speed 9）先行动杀死共享前排 x，同轮内 a（speed 1）行动时 x 已死 → a 顺延锁定后排 y。
        // 行动顺序 b(9) → x/y(5) → a(1)，a 是该轮最后行动的 ally 单位。
        const battle = createBattle({
            heroes: [hero("a", "a", { attack: 10, speed: 1 }), hero("b", "b", { attack: 200, speed: 9 }), hero("x", "x", { position: "front" }), hero("y", "y", { position: "back" })],
            lineups: { ally: ["a", "b"], enemy: ["x", "y"] },
            energyGainAttacker: 10,
            energyGainTarget: 5,
        });
        // tick1: b 行动秒杀 x（锁定 x）；推进到 a 行动（tick2 是 x 阵亡跳过、tick3 是 y 行动、
        // tick4 轮次+1，tick5 b 行动、tick6 y、tick7 a 行动）——循环到 a 锁定非空
        let guard = 0;
        while (battle.state().units.find((u) => u.id === "a")!.lockedTargetId === null && guard < 20) {
            battle.tick();
            guard += 1;
        }
        const allyA = battle.state().units.find((u) => u.id === "a")!;
        const allyB = battle.state().units.find((u) => u.id === "b")!;
        expect(allyB.lockedTargetId).toBe("x");
        expect(allyA.lockedTargetId).toBe("y");
        expect(guard).toBeLessThan(20);
        battle.dispose();
    });

    test("heal skill is not affected by target lock", () => {
        // 治疗单位：首次行动普攻会锁定目标（能量不足），满能量释放治疗后锁定不被触碰
        const healer = hero("a", "a", {
            attack: 0,
            skill: {
                id: "heal-skill",
                name: "Heal",
                kind: "heal",
                value: 30,
                energyCost: 1,
            },
        });
        const battle = createBattle({
            heroes: [healer, hero("e", "e")],
            lineups: { ally: ["a"], enemy: ["e"] },
            energyGainAttacker: 10,
            energyGainTarget: 5,
        });
        battle.tick(); // a 普攻：能量 +10 → 锁定 e
        const before = battle.state().units.find((u) => u.side === "ally")!.lockedTargetId;
        expect(before).toBe("e");
        // 推进到 a 释放治疗：锁定不变
        for (let i = 0; i < 5 && !battle.events().some((ev) => ev.type === "skill-heal"); i += 1) {
            battle.tick();
        }
        expect(battle.events().some((ev) => ev.type === "skill-heal")).toBe(true);
        expect(battle.state().units.find((u) => u.side === "ally")!.lockedTargetId).toBe(before);
        battle.dispose();
    });

    test("state snapshot exposes lockedTargetId and restart clears it", () => {
        const battle = createBattle(lineupContent(["a"], ["ef", "eb"]));
        battle.tick();
        expect(battle.state().units.find((u) => u.side === "ally")!.lockedTargetId).toBe("ef");

        // 重开对局：锁定清空，从无锁定状态重新开始
        battle.restart();
        const afterRestart = battle.state().units.find((u) => u.side === "ally")!;
        expect(afterRestart.lockedTargetId).toBeNull();
        battle.dispose();
    });
});

describe("Auto-battle opening instantiation from lineup", () => {
    test("units are placed onto distinct formation cells within their own side", () => {
        const battle = createBattle(lineupContent(["a0", "a1"], ["e0", "e1"]));
        const { units } = battle.state();

        const allyCells = units.filter((u) => u.side === "ally").map((u) => u.gridKey);
        const enemyCells = units.filter((u) => u.side === "enemy").map((u) => u.gridKey);

        expect(allyCells).toHaveLength(2);
        expect(enemyCells).toHaveLength(2);
        // 同侧格子互不重复
        expect(new Set(allyCells).size).toBe(2);
        expect(new Set(enemyCells).size).toBe(2);

        // 敌左己右：敌方布阵区全部在己方左侧
        const enemyCols = enemyCells.map((cell) => Number(cell.split(":")[1]));
        const allyCols = allyCells.map((cell) => Number(cell.split(":")[1]));
        expect(Math.max(...enemyCols)).toBeLessThan(Math.min(...allyCols));

        battle.dispose();
    });

    test("a unit is placed onto the grid cell matching its lineup slot", () => {
        const config = createAutoBattleConfig(lineupContent(["a", "b"], ["e"]));
        const clock = createAutoBattleClock();
        const pair: AutoBattleLineupPair = {
            ally: [
                { slot: 8, heroId: "a" },
                { slot: 0, heroId: "b" },
            ],
            enemy: [{ slot: 2, heroId: "e" }],
        };
        const battle = createAutoBattleBattle({ clock, config, lineups: () => pair });

        const { units } = battle.state;
        const byId = new Map(units.map((u) => [u.id, u.gridKey]));

        // 布阵区 ally 侧格序：row-major，col 从 3 起，slot 8 即 (2,5)
        expect(byId.get("a")).toBe("2:5");
        expect(byId.get("b")).toBe("0:3");
        // 布阵区 enemy 侧格序：col 从 0 起，slot 2 即 (0,2)
        expect(byId.get("e")).toBe("0:2");

        battle.dispose();
    });

    test("opening units match the configured lineup", () => {
        const battle = createBattle(lineupContent(["a0", "a1", "a2"], ["e0"]));
        const { units } = battle.state();

        const allyIds = units.filter((u) => u.side === "ally").map((u) => u.id);
        expect(allyIds).toEqual(["a0", "a1", "a2"]);
        expect(units.filter((u) => u.side === "enemy").map((u) => u.id)).toEqual(["e0"]);

        battle.dispose();
    });
});

describe("Auto-battle determinism and lineup decoupling", () => {
    test("two battles from the same lineup replay identical event sequences", () => {
        const content = lineupContent(["a", "b"], ["e", "f"]);
        const first = createBattle(content);
        const second = createBattle(content);

        for (let index = 0; index < 30; index += 1) {
            first.tick();
            second.tick();
        }

        expect(first.events()).toEqual(second.events());
        // 完整状态快照（含 lockedTargetId）也一致：锁定不破坏确定性
        expect(first.state().units).toEqual(second.state().units);

        first.dispose();
        second.dispose();
    });

    test("battle unit changes do not leak back into the config lineup", () => {
        const battle = createBattle(lineupContent(["a"], ["e"]));

        const lineupsBefore = JSON.stringify(battle.config.lineups);
        const heroesBefore = JSON.stringify(battle.config.heroes);
        battle.tick();

        // 战斗单位掉血，但配置/编队数据保持不可变
        const enemy = battle.state().units.find((u) => u.side === "enemy");
        expect(enemy?.hp).toBeLessThan(100);
        expect(JSON.stringify(battle.config.lineups)).toBe(lineupsBefore);
        expect(JSON.stringify(battle.config.heroes)).toBe(heroesBefore);

        battle.dispose();
    });

    test("a battle can switch lineup on restart via the lineup provider", () => {
        const config = createAutoBattleConfig(lineupContent(["a", "b"], ["e"]));
        const clock = createAutoBattleClock();
        let pair: AutoBattleLineupPair = {
            ally: [
                { slot: 0, heroId: "a" },
                { slot: 1, heroId: "b" },
            ],
            enemy: [{ slot: 0, heroId: "e" }],
        };
        const battle = createAutoBattleBattle({
            clock,
            config,
            lineups: () => pair,
        });

        const idsOf = (): string[] => battle.state.units.map((u) => u.id).sort();
        expect(idsOf()).toEqual(["a", "b", "e"]);

        // 玩家改编队后重开：战斗按新编队重新实例化
        pair = { ally: [{ slot: 2, heroId: "b" }], enemy: [{ slot: 0, heroId: "e" }] };
        battle.restart();
        expect(idsOf()).toEqual(["b", "e"]);

        battle.dispose();
    });

    test("an empty ally lineup ends the battle immediately as a loss", () => {
        const config = createAutoBattleConfig(lineupContent(["a"], ["e"]));
        const clock = createAutoBattleClock();
        const battle = createAutoBattleBattle({
            clock,
            config,
            lineups: () => ({
                ally: [],
                enemy: [{ slot: 0, heroId: "e" }],
            }),
        });

        const state = battle.state;
        expect(state.phase).toBe("over");
        expect(state.result).toBe("lose");

        battle.dispose();
    });

    test("a dynamic lineup exceeding the team size is rejected", () => {
        const config = createAutoBattleConfig(lineupContent(["a"], ["e"]));
        const clock = createAutoBattleClock();
        expect(() =>
            createAutoBattleBattle({
                clock,
                config,
                lineups: () => ({
                    ally: Array.from({ length: 7 }, (_, slot) => ({
                        slot,
                        heroId: "a",
                    })),
                    enemy: [{ slot: 0, heroId: "e" }],
                }),
            }),
        ).toThrow(/at most 6/);

        clock.dispose?.();
    });
});
