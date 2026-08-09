import type { Module } from "../../../framework";
import type { AutoBattleSkill } from "../models";

/** 技能结算结果：按技能类型返回实际生效的伤害或治疗量。 */
export type AutoBattleSkillEffect =
    | { readonly kind: "damage"; readonly damage: number; readonly kills: boolean }
    | { readonly kind: "heal"; readonly heal: number };

/** 受击结算：扣除伤害并 clamp 到 0，返回实际扣减量与是否阵亡。 */
export function applyAutoBattleDamage(
    hp: number,
    damage: number,
): { readonly hp: number; readonly applied: number; readonly kills: boolean } {
    const applied = Math.min(hp, damage);
    const next = Math.max(0, hp - damage);
    return { hp: next, applied, kills: next === 0 };
}

/** 治疗结算：恢复血量并 clamp 到上限，返回实际恢复量。 */
export function applyAutoBattleHeal(
    hp: number,
    maxHp: number,
    heal: number,
): { readonly hp: number; readonly applied: number } {
    const applied = Math.min(heal, Math.max(0, maxHp - hp));
    return { hp: hp + applied, applied };
}

/** 能量增长：按配置增加能量，不超过能量上限。 */
export function growAutoBattleEnergy(
    energy: number,
    energyMax: number,
    gain: number,
): number {
    return Math.min(energyMax, energy + gain);
}

/** 技能结算纯函数：按技能类型结算到目标当前 HP，不修改任何状态。 */
export function resolveAutoBattleSkill(
    skill: AutoBattleSkill,
    targetHp: number,
    targetMaxHp: number,
): AutoBattleSkillEffect {
    if (skill.kind === "damage") {
        const result = applyAutoBattleDamage(targetHp, skill.value);
        return { kind: "damage", damage: result.applied, kills: result.kills };
    }
    const result = applyAutoBattleHeal(targetHp, targetMaxHp, skill.value);
    return { kind: "heal", heal: result.applied };
}

/**
 * 技能模块：结算规则为纯函数，模块只登记引用使其进入装配清单，
 * 生命周期无副作用（对齐其它品类模块的登记语义）。
 */
export function createAutoBattleSkillsModule(): Module {
    return {
        id: "auto_battle.skills",
        dependencies: [],
        start: () => {
            // 纯函数模块无共享状态；start 只是让模块进入装配清单
            void resolveAutoBattleSkill;
        },
    };
}
