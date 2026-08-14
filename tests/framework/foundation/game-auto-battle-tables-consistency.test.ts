import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
    AUTO_BATTLE_BASE_ATTRIBUTES,
    AUTO_BATTLE_BUFFS,
    AUTO_BATTLE_ENERGY_GAIN_ATTACKER,
    AUTO_BATTLE_ENERGY_GAIN_TARGET,
    AUTO_BATTLE_HEROES,
    AUTO_BATTLE_LINEUPS,
    AUTO_BATTLE_SKILL_CONDITIONS,
    AUTO_BATTLE_SKILL_EFFECTS,
    AUTO_BATTLE_SKILLS,
    AUTO_BATTLE_UNIT_ANIMATIONS,
} from "../../../assets/samples/game_auto_battle/content/autoBattleTables";

/** 读取 JSON 权威数据源（assets/game-content/auto-battle/）。 */
function readJsonTable(fileName: string): unknown {
    const path = resolve(import.meta.dir, "../../../assets/game-content/auto-battle", fileName);
    return JSON.parse(readFileSync(path, "utf8"));
}

describe("Auto-battle table JSON consistency", () => {
    test("base attributes match the JSON source", () => {
        expect(AUTO_BATTLE_BASE_ATTRIBUTES).toEqual(readJsonTable("base-attributes.json"));
    });

    test("heroes match the JSON source", () => {
        expect(AUTO_BATTLE_HEROES).toEqual(readJsonTable("heroes.json"));
    });

    test("unit animations match the JSON source", () => {
        expect(AUTO_BATTLE_UNIT_ANIMATIONS).toEqual(readJsonTable("unit-animations.json"));
    });

    test("skills match the JSON source", () => {
        expect(AUTO_BATTLE_SKILLS).toEqual(readJsonTable("skills.json"));
    });

    test("buffs match the JSON source", () => {
        expect(AUTO_BATTLE_BUFFS).toEqual(readJsonTable("buffs.json"));
    });

    test("skill effects match the JSON source", () => {
        expect(AUTO_BATTLE_SKILL_EFFECTS).toEqual(readJsonTable("skill-effects.json"));
    });

    test("skill conditions match the JSON source", () => {
        expect(AUTO_BATTLE_SKILL_CONDITIONS).toEqual(readJsonTable("skill-conditions.json"));
    });

    test("lineups and energy rules match the battle-setup JSON source", () => {
        const setup = readJsonTable("battle-setup.json") as {
            readonly lineups: { readonly ally: readonly string[]; readonly enemy: readonly string[] };
            readonly energyGainAttacker: number;
            readonly energyGainTarget: number;
        };
        expect(AUTO_BATTLE_LINEUPS).toEqual(setup.lineups);
        expect(AUTO_BATTLE_ENERGY_GAIN_ATTACKER).toBe(setup.energyGainAttacker);
        expect(AUTO_BATTLE_ENERGY_GAIN_TARGET).toBe(setup.energyGainTarget);
    });
});
