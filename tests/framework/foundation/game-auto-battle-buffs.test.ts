import { describe, expect, test } from "bun:test";

import type { AutoBattleBuff } from "../../../assets/samples/game_auto_battle/models";
import {
    applyAutoBattleBuffTick,
    autoBattleBuffAttackBonus,
    autoBattleBuffDefenseBonus,
    createAutoBattleBuffInstance,
    tickAutoBattleBuffs,
} from "../../../assets/samples/game_auto_battle/logic/buffs";

function buff(id: string, kind: AutoBattleBuff["kind"], value: number, duration: number): AutoBattleBuff {
    return { id, name: id, kind, value, duration };
}

describe("Auto-battle buffs", () => {
    test("damage-over-time tick deals value damage clamped to zero", () => {
        const result = applyAutoBattleBuffTick(buff("poison", "damage-over-time", 3, 3), 10, 20);
        expect(result.hp).toBe(7);
        expect(result.applied).toBe(3);
        expect(result.kills).toBe(false);
    });

    test("damage-over-time tick that reaches zero kills", () => {
        const result = applyAutoBattleBuffTick(buff("poison", "damage-over-time", 5, 3), 3, 20);
        expect(result.hp).toBe(0);
        expect(result.kills).toBe(true);
    });

    test("heal tick restores hp clamped to max", () => {
        const result = applyAutoBattleBuffTick(buff("regen", "heal", 4, 3), 18, 20);
        expect(result.hp).toBe(20);
        expect(result.applied).toBe(2);
    });

    test("attack-up and defense-up do not touch hp", () => {
        const attack = applyAutoBattleBuffTick(buff("atk", "attack-up", 2, 2), 10, 20);
        expect(attack.hp).toBe(10);
        const defense = applyAutoBattleBuffTick(buff("def", "defense-up", 2, 2), 10, 20);
        expect(defense.hp).toBe(10);
    });

    test("attack bonus sums attack-up buff values", () => {
        const instances = [
            createAutoBattleBuffInstance(buff("a", "attack-up", 2, 2)),
            createAutoBattleBuffInstance(buff("b", "attack-up", 3, 2)),
            createAutoBattleBuffInstance(buff("c", "defense-up", 9, 2)),
        ];
        expect(autoBattleBuffAttackBonus(instances)).toBe(5);
    });

    test("defense bonus sums defense-up buff values", () => {
        const instances = [createAutoBattleBuffInstance(buff("a", "defense-up", 2, 2)), createAutoBattleBuffInstance(buff("b", "attack-up", 9, 2))];
        expect(autoBattleBuffDefenseBonus(instances)).toBe(2);
    });

    test("tick decreases remaining turns and removes expired buffs", () => {
        const instances = [createAutoBattleBuffInstance(buff("a", "attack-up", 2, 1)), createAutoBattleBuffInstance(buff("b", "attack-up", 3, 3))];
        const after = tickAutoBattleBuffs(instances);
        expect(after).toHaveLength(1);
        expect(after[0]?.def.id).toBe("b");
        expect(after[0]?.remaining).toBe(2);
    });
});
