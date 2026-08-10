import { describe, expect, test } from "bun:test";

import { createAutoBattleBattle } from "../../../assets/samples/game_auto_battle/logic/battle";
import { createAutoBattleClock } from "../../../assets/samples/game_auto_battle/logic/clock";
import {
    createAutoBattleConfig,
    type AutoBattleConfigHandle,
} from "../../../assets/samples/game_auto_battle/logic/config";
import type { AutoBattleState } from "../../../assets/samples/game_auto_battle/models";

/** 构造英雄池条目（heroes 格式）。 */
function hero(
    id: string,
    name: string,
    overrides: Record<string, unknown> = {},
): Record<string, unknown> {
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
function lineupContent(
    ally: readonly string[],
    enemy: readonly string[],
): Record<string, unknown> {
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
    readonly events: () => readonly { type: string }[];
    readonly tick: () => void;
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
        dispose: () => battle.dispose(),
    };
}

describe("Auto-battle opening instantiation from lineup", () => {
    test("units are placed onto distinct formation cells within their own side", () => {
        const battle = createBattle(
            lineupContent(["a0", "a1"], ["e0", "e1"]),
        );
        const { units } = battle.state();

        const allyCells = units
            .filter((u) => u.side === "ally")
            .map((u) => u.gridKey);
        const enemyCells = units
            .filter((u) => u.side === "enemy")
            .map((u) => u.gridKey);

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

    test("opening units match the configured lineup", () => {
        const battle = createBattle(
            lineupContent(["a0", "a1", "a2"], ["e0"]),
        );
        const { units } = battle.state();

        const allyIds = units
            .filter((u) => u.side === "ally")
            .map((u) => u.id);
        expect(allyIds).toEqual(["a0", "a1", "a2"]);
        expect(units.filter((u) => u.side === "enemy").map((u) => u.id)).toEqual([
            "e0",
        ]);

        battle.dispose();
    });
});

describe("Auto-battle determinism and lineup decoupling", () => {
    test("two battles from the same lineup replay identical event sequences", () => {
        const content = lineupContent(
            ["a", "b"],
            ["e", "f"],
        );
        const first = createBattle(content);
        const second = createBattle(content);

        for (let index = 0; index < 30; index += 1) {
            first.tick();
            second.tick();
        }

        expect(first.events()).toEqual(second.events());

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
});
