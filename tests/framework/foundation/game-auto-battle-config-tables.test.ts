import { describe, expect, test } from "bun:test";

import { createAutoBattleConfig } from "../../../assets/samples/game_auto_battle/logic/config";
import {
    AUTO_BATTLE_BASE_ATTRIBUTES,
    AUTO_BATTLE_BUFFS,
    AUTO_BATTLE_HEROES,
    AUTO_BATTLE_SKILL_CONDITIONS,
    AUTO_BATTLE_SKILL_EFFECTS,
    AUTO_BATTLE_SKILLS,
    AUTO_BATTLE_UNIT_ANIMATIONS,
    createDefaultAutoBattleConfigContent,
} from "../../../assets/samples/game_auto_battle/content/autoBattleTables";

/** 用缺省 7 表内容构造配置（新表驱动格式）。 */
function tableContent(): Record<string, unknown> {
    return createDefaultAutoBattleConfigContent();
}

describe("Auto-battle table-driven config", () => {
    test("parses base attributes, skills, buffs, animations, effects and conditions tables", () => {
        const config = createAutoBattleConfig(tableContent());

        // 7 张表被解析并暴露
        expect(config.baseAttributes.map((a) => a.id).sort()).toEqual(AUTO_BATTLE_BASE_ATTRIBUTES.map((a) => a.id).sort());
        expect(config.skills.map((s) => s.id).sort()).toEqual(AUTO_BATTLE_SKILLS.map((s) => s.id).sort());
        expect(config.buffs.map((b) => b.id).sort()).toEqual(AUTO_BATTLE_BUFFS.map((b) => b.id).sort());
        expect(config.unitAnimations.map((a) => a.id).sort()).toEqual(AUTO_BATTLE_UNIT_ANIMATIONS.map((a) => a.id).sort());
        expect(config.skillEffects.map((e) => e.id).sort()).toEqual(AUTO_BATTLE_SKILL_EFFECTS.map((e) => e.id).sort());
        expect(config.skillConditions.map((c) => c.id).sort()).toEqual(AUTO_BATTLE_SKILL_CONDITIONS.map((c) => c.id).sort());
    });

    test("expands heroes from base attribute and skill references", () => {
        const config = createAutoBattleConfig(tableContent());

        const tank = config.heroes.find((h) => h.id === "ally-tank");
        expect(tank).toBeDefined();
        // 基础属性从 baseAttributeId 展开
        expect(tank?.maxHp).toBe(60);
        expect(tank?.attack).toBe(6);
        expect(tank?.speed).toBe(8);
        // 技能从 skillId 展开，不再内联
        expect(tank?.skill.id).toBe("ally-tank-skill");
        expect(tank?.skill.kind).toBe("damage");
        // 动画 id 引用保留
        expect(tank?.animationId).toBe("warrior-f");
    });

    test("multi-effect skills keep the full effects list", () => {
        const config = createAutoBattleConfig(tableContent());

        const skill = config.skills.find((s) => s.id === "ally-mage-skill");
        expect(skill?.effects).toEqual([{ kind: "damage", value: 15 }]);
        // 主效果快捷字段与首效果一致（向后兼容）
        expect(skill?.kind).toBe("damage");
        expect(skill?.value).toBe(15);
        // 动效/条件引用
        expect(skill?.effectId).toBe("fireball-explosion");
    });

    test("skill referencing an unknown base attribute is rejected", () => {
        expect(() =>
            createAutoBattleConfig({
                ...tableContent(),
                heroes: [
                    { id: "x", name: "X", position: "front", baseAttributeId: "ghost", energyMax: 20, skillId: "ally-tank-skill" },
                    ...AUTO_BATTLE_HEROES,
                ],
            }),
        ).toThrow(/base attribute/);
    });

    test("skill referencing an unknown skill id is rejected", () => {
        expect(() =>
            createAutoBattleConfig({
                ...tableContent(),
                heroes: [
                    { id: "x", name: "X", position: "front", baseAttributeId: "tank", energyMax: 20, skillId: "ghost-skill" },
                    ...AUTO_BATTLE_HEROES,
                ],
            }),
        ).toThrow(/skill/);
    });

    test("hero skill reference normalizes to the legacy inline hero shape", () => {
        const config = createAutoBattleConfig(tableContent());
        const ally = config.ally.find((u) => u.id === "ally-tank");
        // 展开后单位携带 skill 与属性（battle 仍按 AutoBattleUnit 消费）
        expect(ally?.skill.id).toBe("ally-tank-skill");
        expect(ally?.maxHp).toBe(60);
    });
});
