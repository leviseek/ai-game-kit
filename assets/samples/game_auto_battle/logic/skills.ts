import type { IModule } from "../../../framework";
import type { AutoBattleBuff, AutoBattleSkill, AutoBattleSkillEffect } from "../models";

/** 技能结算结果：按效果类型返回实际生效值、结算后 HP 与是否阵亡。 */
export type AutoBattleSkillEffectResult =
    | {
          readonly kind: "damage";
          readonly hp: number;
          readonly applied: number;
          readonly kills: boolean;
      }
    | { readonly kind: "heal"; readonly hp: number; readonly applied: number }
    | {
          readonly kind: "buff";
          /** 挂载的 buff 定义（由 battle 经 buff 表解析，供战斗侧挂到目标）。 */
          readonly buff: AutoBattleBuff;
          readonly hp: number;
          readonly applied: number;
      };

/** 受击结算：扣除伤害并 clamp 到 0，返回实际扣减量与是否阵亡。 */
export function applyAutoBattleDamage(hp: number, damage: number): { readonly hp: number; readonly applied: number; readonly kills: boolean } {
    const applied = Math.min(hp, damage);
    const next = Math.max(0, hp - damage);
    return { hp: next, applied, kills: next === 0 };
}

/** 治疗结算：恢复血量并 clamp 到上限，返回实际恢复量。 */
export function applyAutoBattleHeal(hp: number, maxHp: number, heal: number): { readonly hp: number; readonly applied: number } {
    const applied = Math.min(heal, Math.max(0, maxHp - hp));
    return { hp: hp + applied, applied };
}

/** 能量增长：按配置增加能量，不超过能量上限。 */
export function growAutoBattleEnergy(energy: number, energyMax: number, gain: number): number {
    return Math.min(energyMax, energy + gain);
}

/** 解析技能效果的目标 HP 结算（damage/heal），buff 效果不修改 HP。 */
export function resolveAutoBattleSkillEffect(effect: AutoBattleSkillEffect, buff: AutoBattleBuff | undefined, targetHp: number, targetMaxHp: number): AutoBattleSkillEffectResult {
    if (effect.kind === "damage") {
        const outcome = applyAutoBattleDamage(targetHp, effect.value);
        return {
            kind: "damage",
            hp: outcome.hp,
            applied: outcome.applied,
            kills: outcome.kills,
        };
    }
    if (effect.kind === "heal") {
        const outcome = applyAutoBattleHeal(targetHp, targetMaxHp, effect.value);
        return { kind: "heal", hp: outcome.hp, applied: outcome.applied };
    }
    if (buff === undefined) {
        throw new Error(`auto-battle skill: buff effect references missing buff id "${effect.buffId ?? ""}"`);
    }
    return { kind: "buff", buff, hp: targetHp, applied: 0 };
}

/**
 * 技能多效果结算纯函数：按效果列表逐条结算到目标当前 HP，返回每条效果的结果，
 * 不修改任何状态。单效果快捷字段（kind/value）归一化为效果列表首条，
 * 避免伤害钳制/治疗上限规则在多处重复实现导致漂移。
 */
export function resolveAutoBattleSkill(skill: AutoBattleSkill, targetHp: number, targetMaxHp: number, buffById: (buffId: string) => AutoBattleBuff | undefined): readonly AutoBattleSkillEffectResult[] {
    const effects = skill.effects ?? [{ kind: skill.kind, value: skill.value }];
    let hp = targetHp;
    const results: AutoBattleSkillEffectResult[] = [];
    for (const effect of effects) {
        const buff = effect.kind === "buff" ? buffById(effect.buffId ?? "") : undefined;
        const result = resolveAutoBattleSkillEffect(effect, buff, hp, targetMaxHp);
        hp = result.hp;
        results.push(result);
    }
    return results;
}

/**
 * 技能模块：结算规则为纯函数，模块只登记引用使其进入装配清单，
 * 生命周期无副作用（对齐其它品类模块的登记语义）。
 */
export function createAutoBattleSkillsModule(): IModule {
    return {
        id: "auto_battle.skills",
        dependencies: [],
        start: () => {
            // 纯函数模块无共享状态；start 只是让模块进入装配清单
            void resolveAutoBattleSkill;
        },
    };
}
