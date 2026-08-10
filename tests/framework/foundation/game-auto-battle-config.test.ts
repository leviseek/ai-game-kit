import { describe, expect, test } from "bun:test";

import {
    MAX_TEAM_SIZE,
    createAutoBattleConfig,
} from "../../../assets/samples/game_auto_battle/logic/config";

/** 构造英雄池条目：形状为 AutoBattleUnit 去掉 side/index。 */
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

function heroLineup(ids: readonly string[]): Record<string, unknown> {
    return ids.map((id) => hero(id, id));
}

function baseContent(): Record<string, unknown> {
    return {
        energyGainAttacker: 10,
        energyGainTarget: 5,
    };
}

describe("Auto-battle config heroes + lineups", () => {
    test("expands lineups into ally/enemy units with side and index", () => {
        const config = createAutoBattleConfig({
            ...baseContent(),
            heroes: heroLineup(["a", "b", "e"]),
            lineups: { ally: ["a", "b"], enemy: ["e"] },
        });

        expect(config.ally.map((u) => u.id)).toEqual(["a", "b"]);
        expect(config.ally.map((u) => u.index)).toEqual([0, 1]);
        expect(config.ally.every((u) => u.side === "ally")).toBe(true);
        expect(config.enemy.map((u) => u.id)).toEqual(["e"]);
        expect(config.enemy[0]!.side).toBe("enemy");
        expect(config.enemy[0]!.index).toBe(0);
    });

    test("exposes the hero pool and the initial lineups", () => {
        const config = createAutoBattleConfig({
            ...baseContent(),
            heroes: heroLineup(["a", "b", "e"]),
            lineups: { ally: ["a", "b"], enemy: ["e"] },
        });

        expect(config.heroes.map((h) => h.id)).toEqual(["a", "b", "e"]);
        expect(config.lineups.ally).toEqual(["a", "b"]);
        expect(config.lineups.enemy).toEqual(["e"]);
    });

    test("rejects a lineup referencing an unknown hero", () => {
        expect(() =>
            createAutoBattleConfig({
                ...baseContent(),
                heroes: heroLineup(["a"]),
                lineups: { ally: ["ghost"], enemy: ["a"] },
            }),
        ).toThrow();
    });

    test("rejects a lineup repeating the same hero id", () => {
        expect(() =>
            createAutoBattleConfig({
                ...baseContent(),
                heroes: heroLineup(["a", "e"]),
                lineups: { ally: ["a", "a"], enemy: ["e"] },
            }),
        ).toThrow();
    });

    test("rejects a duplicate hero id in the hero pool", () => {
        expect(() =>
            createAutoBattleConfig({
                ...baseContent(),
                heroes: [hero("a", "A"), hero("a", "A2")],
                lineups: { ally: ["a"], enemy: ["a"] },
            }),
        ).toThrow();
    });

    test("rejects a missing lineups key", () => {
        expect(() =>
            createAutoBattleConfig({
                ...baseContent(),
                heroes: heroLineup(["a", "e"]),
            }),
        ).toThrow();
    });

    test("rejects a lineup exceeding the team size upper bound", () => {
        const ids = Array.from(
            { length: MAX_TEAM_SIZE + 1 },
            (_, i) => `a${i}`,
        );

        expect(() =>
            createAutoBattleConfig({
                ...baseContent(),
                heroes: heroLineup(ids),
                lineups: { ally: ids, enemy: ["e"] },
            }),
        ).toThrow();
    });

    test("rejects an empty lineup (at least one unit per side)", () => {
        expect(() =>
            createAutoBattleConfig({
                ...baseContent(),
                heroes: heroLineup(["a", "e"]),
                lineups: { ally: [], enemy: ["e"] },
            }),
        ).toThrow();
    });

    test("rejects an invalid hero entry", () => {
        expect(() =>
            createAutoBattleConfig({
                ...baseContent(),
                heroes: [{ id: "bad" }],
                lineups: { ally: ["bad"], enemy: ["e"] },
            }),
        ).toThrow();
    });
});

describe("Auto-battle config legacy teams fallback", () => {
    test("falls back to the legacy teams format", () => {
        const config = createAutoBattleConfig({
            teams: {
                ally: [hero("a", "Tank")],
                enemy: [hero("e", "Slime")],
            },
            ...baseContent(),
        });

        expect(config.ally.map((u) => u.id)).toEqual(["a"]);
        expect(config.enemy.map((u) => u.id)).toEqual(["e"]);
        // 兼容路径同时产出英雄池与编队，便于统一走 lineup 实例化
        expect(config.heroes.map((h) => h.id).sort()).toEqual(["a", "e"]);
        expect(config.lineups.ally).toEqual(["a"]);
        expect(config.lineups.enemy).toEqual(["e"]);
    });

    test("legacy fallback keeps the team size upper bound", () => {
        const ids = Array.from(
            { length: MAX_TEAM_SIZE + 1 },
            (_, i) => `a${i}`,
        );

        expect(() =>
            createAutoBattleConfig({
                teams: { ally: heroLineup(ids), enemy: [hero("e", "Slime")] },
                ...baseContent(),
            }),
        ).toThrow();
    });

    test("legacy fallback rejects the same hero id across sides", () => {
        expect(() =>
            createAutoBattleConfig({
                teams: {
                    ally: [hero("a", "Tank")],
                    enemy: [hero("a", "Slime")],
                },
                ...baseContent(),
            }),
        ).toThrow();
    });
});
