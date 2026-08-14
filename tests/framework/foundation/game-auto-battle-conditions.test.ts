import { describe, expect, test } from "bun:test";

import type { AutoBattleSkillCondition } from "../../../assets/samples/game_auto_battle/models";
import type { AutoBattleUnitView } from "../../../assets/samples/game_auto_battle/logic/formation";
import { resolveAutoBattleSkillCondition } from "../../../assets/samples/game_auto_battle/logic/conditions";

/** 构造施法者视图（条件判定只读 hp/maxHp/position）。 */
function actor(overrides: Partial<AutoBattleUnitView> = {}): AutoBattleUnitView {
    return { id: "a", side: "ally", position: "front", index: 0, maxHp: 100, speed: 5, hp: 100, ...overrides };
}

function condition(overrides: Partial<AutoBattleSkillCondition>): AutoBattleSkillCondition {
    return { id: "c", kind: "always", ...overrides };
}

describe("Auto-battle skill conditions", () => {
    test("always condition is satisfied", () => {
        expect(resolveAutoBattleSkillCondition(condition({ kind: "always" }), actor())).toBe(true);
    });

    test("self-hp-ratio is satisfied below the threshold", () => {
        const below = resolveAutoBattleSkillCondition(condition({ kind: "self-hp-ratio", value: 0.5 }), actor({ hp: 40 }));
        expect(below).toBe(true);
    });

    test("self-hp-ratio is rejected at or above the threshold", () => {
        expect(resolveAutoBattleSkillCondition(condition({ kind: "self-hp-ratio", value: 0.5 }), actor({ hp: 50 }))).toBe(false);
        expect(resolveAutoBattleSkillCondition(condition({ kind: "self-hp-ratio", value: 0.5 }), actor({ hp: 80 }))).toBe(false);
    });

    test("target-position is satisfied for the matching position", () => {
        const front = resolveAutoBattleSkillCondition(condition({ kind: "target-position", value: "front" }), actor({ position: "front" }));
        expect(front).toBe(true);
        const back = resolveAutoBattleSkillCondition(condition({ kind: "target-position", value: "front" }), actor({ position: "back" }));
        expect(back).toBe(false);
    });
});
