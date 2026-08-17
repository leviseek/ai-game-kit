import type { AutoBattleBaseAttributes, AutoBattleBuff, AutoBattleSkill, AutoBattleSkillCondition, AutoBattleSkillEffectDef, AutoBattleUnitAnimation } from "../models";

/**
 * 自动战斗 7 张配置表的 TS 镜像：数据与 `assets/game-content/auto-battle/*.json`
 * 保持同源（组合根经此加载缺省配置）。Cocos 编译管线未开启 resolveJsonModule，
 * 不能直接 import JSON；此处以 TS 常量承载表内容，JSON 是权威数据源，二者一致性
 * 由测试 `game-auto-battle-tables-consistency` 锁定（读 JSON 文件逐表对比）。
 */

/** 1. 基础属性表：数值中心，单位按 id 引用（含攻击射程与每行动移动格数）。 */
export const AUTO_BATTLE_BASE_ATTRIBUTES: readonly AutoBattleBaseAttributes[] = [
    // 近战坦克：普攻距离 1 格、行动可移动 2 格
    { id: "tank", maxHp: 60, attack: 6, speed: 8, attackRange: 1, movePoints: 2 },
    // 法师：普攻距离 4 格、移动 1 格
    { id: "mage", maxHp: 45, attack: 11, speed: 7, attackRange: 4, movePoints: 1 },
    // 牧师：治疗位，普攻距离 2 格、移动 1 格
    { id: "priest", maxHp: 40, attack: 4, speed: 6, attackRange: 2, movePoints: 1 },
    // 近战骷髅：普攻距离 1 格、行动可移动 2 格
    { id: "skeleton", maxHp: 60, attack: 6, speed: 8, attackRange: 1, movePoints: 2 },
    // 巫妖（法师）：普攻距离 4 格、移动 1 格
    { id: "lich", maxHp: 45, attack: 9, speed: 7, attackRange: 4, movePoints: 1 },
    // 萨满：普攻距离 2 格、移动 1 格
    { id: "shaman", maxHp: 40, attack: 4, speed: 6, attackRange: 2, movePoints: 1 },
];

/** 2. 武将单位表：静态定义，引用基础属性/技能/动画，不内联技能对象。 */
export const AUTO_BATTLE_HEROES: readonly Record<string, unknown>[] = [
    { id: "ally-tank", name: "auto_battle.heroes.ally-tank.name", position: "front", baseAttributeId: "tank", energyMax: 20, skillId: "ally-tank-skill", animationId: "warrior-ai" },
    { id: "ally-mage", name: "auto_battle.heroes.ally-mage.name", position: "mid", baseAttributeId: "mage", energyMax: 20, skillId: "ally-mage-skill", animationId: "warrior-f" },
    { id: "ally-priest", name: "auto_battle.heroes.ally-priest.name", position: "back", baseAttributeId: "priest", energyMax: 20, skillId: "ally-priest-skill", animationId: "warrior-f" },
    { id: "enemy-tank", name: "auto_battle.heroes.enemy-tank.name", position: "front", baseAttributeId: "skeleton", energyMax: 20, skillId: "enemy-tank-skill", animationId: "warrior-m" },
    { id: "enemy-mage", name: "auto_battle.heroes.enemy-mage.name", position: "mid", baseAttributeId: "lich", energyMax: 20, skillId: "enemy-mage-skill", animationId: "warrior-m" },
    { id: "enemy-shaman", name: "auto_battle.heroes.enemy-shaman.name", position: "back", baseAttributeId: "shaman", energyMax: 20, skillId: "enemy-shaman-skill", animationId: "warrior-m" },
];

/** 3. 单位动画表：单位 → 动画帧生成参数（替代 animUrls 硬编码映射）。 */
export const AUTO_BATTLE_UNIT_ANIMATIONS: readonly AutoBattleUnitAnimation[] = [
    {
        id: "warrior-f",
        bundle: "animations",
        dir: "auto-battle",
        frameCount: 10,
        frameCountByAnim: { idle: 10, gesture: 10, walk: 10, run: 10, attack: 10, slash: 10, hit: 10, weak: 10, stun: 10, death: 10, skillRaise: 10 },
        frameMsByAnim: { idle: 80, gesture: 80, walk: 80, run: 60, attack: 50, slash: 60, hit: 80, weak: 100, stun: 120, death: 80, skillRaise: 70 },
        prefixByAnim: {
            idle: "warrior_f_idle",
            gesture: "warrior_f_gesture",
            walk: "warrior_f_walk",
            run: "warrior_f_walk",
            attack: "warrior_f_attack",
            slash: "warrior_f_attack",
            hit: "warrior_f_gesture",
            weak: "warrior_f_idle",
            stun: "warrior_f_gesture",
            death: "warrior_f_death",
            skillRaise: "warrior_f_gesture",
        },
    },
    {
        id: "warrior-m",
        bundle: "animations",
        dir: "auto-battle",
        frameCount: 10,
        frameCountByAnim: { idle: 10, gesture: 10, walk: 10, run: 10, attack: 10, slash: 10, hit: 10, weak: 10, stun: 10, death: 10, skillRaise: 10 },
        frameMsByAnim: { idle: 80, gesture: 80, walk: 80, run: 60, attack: 50, slash: 60, hit: 80, weak: 100, stun: 120, death: 80, skillRaise: 70 },
        prefixByAnim: {
            idle: "warrior_m_idle",
            gesture: "warrior_m_gesture",
            walk: "warrior_m_walk",
            run: "warrior_m_walk",
            attack: "warrior_m_attack",
            slash: "warrior_m_attack",
            hit: "warrior_m_gesture",
            weak: "warrior_m_idle",
            stun: "warrior_m_gesture",
            death: "warrior_m_death",
            skillRaise: "warrior_m_gesture",
        },
    },
    {
        // AI 生成动作：idle/gesture 保留单帧立绘，其余动作使用各自独立帧数和节奏。
        id: "warrior-ai",
        bundle: "animations",
        dir: "auto-battle",
        frameCount: 1,
        frameCountByAnim: { idle: 1, gesture: 1, walk: 8, run: 8, attack: 6, slash: 8, hit: 4, weak: 6, stun: 4, death: 10, skillRaise: 8 },
        frameMsByAnim: { idle: 100, gesture: 100, walk: 100, run: 80, attack: 90, slash: 90, hit: 120, weak: 140, stun: 160, death: 120, skillRaise: 100 },
        prefixByAnim: {
            idle: "warrior_ai_idle",
            gesture: "warrior_ai_idle",
            walk: "warrior_ai_walk",
            run: "warrior_ai_run",
            attack: "warrior_ai_attack",
            slash: "warrior_ai_slash",
            hit: "warrior_ai_hit",
            weak: "warrior_ai_weak",
            stun: "warrior_ai_stun",
            death: "warrior_ai_death",
            skillRaise: "warrior_ai_skill_raise",
        },
    },
];

/** 4. 技能表：多效果（damage/heal/buff）、目标选择、条件/动效引用。 */
export const AUTO_BATTLE_SKILLS: readonly AutoBattleSkill[] = [
    {
        id: "ally-tank-skill",
        name: "auto_battle.skills.ally-tank-skill.name",
        kind: "damage",
        value: 12,
        energyCost: 20,
        target: "enemy-front",
        effects: [{ kind: "damage", value: 12 }],
        effectId: "smash-hit",
    },
    {
        id: "ally-mage-skill",
        name: "auto_battle.skills.ally-mage-skill.name",
        kind: "damage",
        value: 15,
        energyCost: 20,
        target: "enemy-front",
        effects: [{ kind: "damage", value: 15 }],
        effectId: "fireball-explosion",
    },
    { id: "ally-priest-skill", name: "auto_battle.skills.ally-priest-skill.name", kind: "heal", value: 10, energyCost: 20, target: "ally-lowest-hp", effects: [{ kind: "heal", value: 10 }] },
    { id: "enemy-tank-skill", name: "auto_battle.skills.enemy-tank-skill.name", kind: "damage", value: 12, energyCost: 20, target: "enemy-front", effects: [{ kind: "damage", value: 12 }] },
    {
        id: "enemy-mage-skill",
        name: "auto_battle.skills.enemy-mage-skill.name",
        kind: "damage",
        value: 15,
        energyCost: 20,
        target: "enemy-front",
        effects: [{ kind: "damage", value: 15 }],
        effectId: "shadow-explosion",
    },
    { id: "enemy-shaman-skill", name: "auto_battle.skills.enemy-shaman-skill.name", kind: "damage", value: 8, energyCost: 20, target: "enemy-front", effects: [{ kind: "damage", value: 8 }] },
];

/** 5. buff 表：增益/减益定义（攻击/防御加成、持续伤害、治疗）。 */
export const AUTO_BATTLE_BUFFS: readonly AutoBattleBuff[] = [
    { id: "attack-up", name: "auto_battle.buffs.attack-up.name", kind: "attack-up", value: 2, duration: 2 },
    { id: "defense-up", name: "auto_battle.buffs.defense-up.name", kind: "defense-up", value: 2, duration: 2 },
    { id: "poison", name: "auto_battle.buffs.poison.name", kind: "damage-over-time", value: 2, duration: 3 },
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
/** 移动能量消耗比例：移动一次消耗 ≈ 回合恢复量 × 该比例（"移动消耗近乎一半"）。 */
export const AUTO_BATTLE_ENERGY_MOVE_COST_RATIO = 0.5;
/** 击杀敌方单位获得的大量能量。 */
export const AUTO_BATTLE_ENERGY_GAIN_ON_KILL = 10;

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
        energyMoveCostRatio: AUTO_BATTLE_ENERGY_MOVE_COST_RATIO,
        energyGainOnKill: AUTO_BATTLE_ENERGY_GAIN_ON_KILL,
    };
}
