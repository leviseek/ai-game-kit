import type { AutoBattleBaseAttributes, AutoBattleBuff, AutoBattleSkill, AutoBattleSkillCondition, AutoBattleSkillEffectDef, AutoBattleUnitAnimation } from "../models";

/**
 * 自动战斗 7 张配置表的 TS 镜像：数据与 `assets/game-content/auto-battle/*.json`
 * 保持同源（组合根经此加载缺省配置）。Cocos 编译管线未开启 resolveJsonModule，
 * 不能直接 import JSON；此处以 TS 常量承载表内容，JSON 是权威数据源，二者一致性
 * 由测试 `game-auto-battle-tables-consistency` 锁定（读 JSON 文件逐表对比）。
 */

/** 1. 基础属性表：数值中心，单位按 id 引用。 */
export const AUTO_BATTLE_BASE_ATTRIBUTES: readonly AutoBattleBaseAttributes[] = [
    { id: "tank", maxHp: 60, attack: 6, speed: 8, attackRange: 1 },
    { id: "mage", maxHp: 45, attack: 11, speed: 7, attackRange: 1 },
    { id: "priest", maxHp: 40, attack: 4, speed: 6, attackRange: 1 },
    { id: "skeleton", maxHp: 60, attack: 6, speed: 8, attackRange: 1 },
    { id: "lich", maxHp: 45, attack: 9, speed: 7, attackRange: 1 },
    { id: "shaman", maxHp: 40, attack: 4, speed: 6, attackRange: 1 },
];

/** 2. 武将单位表：静态定义，引用基础属性/技能/动画，不内联技能对象。 */
export const AUTO_BATTLE_HEROES: readonly Record<string, unknown>[] = [
    { id: "ally-tank", name: "坦克", position: "front", baseAttributeId: "tank", energyMax: 20, skillId: "ally-tank-skill", animationId: "warrior-f" },
    { id: "ally-mage", name: "法师", position: "mid", baseAttributeId: "mage", energyMax: 20, skillId: "ally-mage-skill", animationId: "warrior-f" },
    { id: "ally-priest", name: "牧师", position: "back", baseAttributeId: "priest", energyMax: 20, skillId: "ally-priest-skill", animationId: "warrior-f" },
    { id: "enemy-tank", name: "骷髅", position: "front", baseAttributeId: "skeleton", energyMax: 20, skillId: "enemy-tank-skill", animationId: "warrior-m" },
    { id: "enemy-mage", name: "巫妖", position: "mid", baseAttributeId: "lich", energyMax: 20, skillId: "enemy-mage-skill", animationId: "warrior-m" },
    { id: "enemy-shaman", name: "萨满", position: "back", baseAttributeId: "shaman", energyMax: 20, skillId: "enemy-shaman-skill", animationId: "warrior-m" },
];

/** 3. 单位动画表：单位 → 动画帧生成参数（替代 animUrls 硬编码映射）。 */
export const AUTO_BATTLE_UNIT_ANIMATIONS: readonly AutoBattleUnitAnimation[] = [
    {
        id: "warrior-f",
        bundle: "animations",
        dir: "auto-battle",
        frameCount: 10,
        prefixByAnim: { idle: "warrior_f_idle", gesture: "warrior_f_gesture", walk: "warrior_f_walk", attack: "warrior_f_attack", death: "warrior_f_death" },
    },
    {
        id: "warrior-m",
        bundle: "animations",
        dir: "auto-battle",
        frameCount: 10,
        prefixByAnim: { idle: "warrior_m_idle", gesture: "warrior_m_gesture", walk: "warrior_m_walk", attack: "warrior_m_attack", death: "warrior_m_death" },
    },
];

/** 4. 技能表：多效果（damage/heal/buff）、目标选择、条件/动效引用。 */
export const AUTO_BATTLE_SKILLS: readonly AutoBattleSkill[] = [
    { id: "ally-tank-skill", name: "重击", kind: "damage", value: 12, energyCost: 20, target: "enemy-front", effects: [{ kind: "damage", value: 12 }], effectId: "smash-hit" },
    { id: "ally-mage-skill", name: "火球", kind: "damage", value: 15, energyCost: 20, target: "enemy-front", effects: [{ kind: "damage", value: 15 }], effectId: "fireball-explosion" },
    { id: "ally-priest-skill", name: "治疗", kind: "heal", value: 10, energyCost: 20, target: "ally-lowest-hp", effects: [{ kind: "heal", value: 10 }] },
    { id: "enemy-tank-skill", name: "爪击", kind: "damage", value: 12, energyCost: 20, target: "enemy-front", effects: [{ kind: "damage", value: 12 }] },
    { id: "enemy-mage-skill", name: "暗影", kind: "damage", value: 15, energyCost: 20, target: "enemy-front", effects: [{ kind: "damage", value: 15 }], effectId: "shadow-explosion" },
    { id: "enemy-shaman-skill", name: "妖术", kind: "damage", value: 8, energyCost: 20, target: "enemy-front", effects: [{ kind: "damage", value: 8 }] },
];

/** 5. buff 表：增益/减益定义（攻击/防御加成、持续伤害、治疗）。 */
export const AUTO_BATTLE_BUFFS: readonly AutoBattleBuff[] = [
    { id: "attack-up", name: "攻击强化", kind: "attack-up", value: 2, duration: 2 },
    { id: "defense-up", name: "防御强化", kind: "defense-up", value: 2, duration: 2 },
    { id: "poison", name: "中毒", kind: "damage-over-time", value: 2, duration: 3 },
];

/** 6. 技能动效表：技能 → 视觉动效意图（对接 HitFeedbackEffect）。 */
export const AUTO_BATTLE_SKILL_EFFECTS: readonly AutoBattleSkillEffectDef[] = [
    { id: "smash-hit", kind: "explosion" },
    { id: "fireball-explosion", kind: "explosion" },
    { id: "shadow-explosion", kind: "explosion" },
];

/** 7. 技能条件表：释放/目标选择条件。 */
export const AUTO_BATTLE_SKILL_CONDITIONS: readonly AutoBattleSkillCondition[] = [{ id: "self-hp-below-half", kind: "self-hp-ratio", value: 0.5 }];

/** 缺省编队与能量规则（随 7 表同源维护）。 */
export const AUTO_BATTLE_LINEUPS: { readonly ally: readonly string[]; readonly enemy: readonly string[] } = {
    ally: ["ally-tank", "ally-mage", "ally-priest"],
    enemy: ["enemy-tank", "enemy-mage", "enemy-shaman"],
};

export const AUTO_BATTLE_ENERGY_GAIN_ATTACKER = 10;
export const AUTO_BATTLE_ENERGY_GAIN_TARGET = 5;

/**
 * 缺省自动战斗配置内容：把 7 张表与编队/能量规则组装为 configContent 形状
 * （heroes 引用表条目，组合根经 createAutoBattleConfig 解析时归一化展开）。
 */
export function createDefaultAutoBattleConfigContent(): Record<string, unknown> {
    return {
        baseAttributes: AUTO_BATTLE_BASE_ATTRIBUTES,
        heroes: AUTO_BATTLE_HEROES,
        unitAnimations: AUTO_BATTLE_UNIT_ANIMATIONS,
        skills: AUTO_BATTLE_SKILLS,
        buffs: AUTO_BATTLE_BUFFS,
        skillEffects: AUTO_BATTLE_SKILL_EFFECTS,
        skillConditions: AUTO_BATTLE_SKILL_CONDITIONS,
        lineups: AUTO_BATTLE_LINEUPS,
        energyGainAttacker: AUTO_BATTLE_ENERGY_GAIN_ATTACKER,
        energyGainTarget: AUTO_BATTLE_ENERGY_GAIN_TARGET,
    };
}
