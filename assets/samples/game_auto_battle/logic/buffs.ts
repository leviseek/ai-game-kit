import type { AutoBattleBuff, AutoBattleBuffInstance } from "../models";

/** buff 结算结果：结算后 HP、实际生效值、是否阵亡（持续伤害扣到 0）。 */
export interface AutoBattleBuffTickResult {
    readonly hp: number;
    readonly applied: number;
    readonly kills: boolean;
}

/** 创建 buff 实例：挂载时剩余回合 = 定义持续时长。 */
export function createAutoBattleBuffInstance(def: AutoBattleBuff): AutoBattleBuffInstance {
    return { def, remaining: def.duration };
}

/**
 * 单回合 buff 结算纯函数：按 kind 结算 HP 变化。
 * - damage-over-time：扣除 value（clamp 到 0，返回 kills）
 * - heal：恢复 value（clamp 到上限）
 * - attack-up/defense-up：不改 HP（攻击/防御加成在伤害结算时查询）
 * 返回新 HP 与生效值，不修改状态。
 */
export function applyAutoBattleBuffTick(buff: AutoBattleBuff, hp: number, maxHp: number): AutoBattleBuffTickResult {
    if (buff.kind === "damage-over-time") {
        const applied = Math.min(hp, buff.value);
        const next = Math.max(0, hp - buff.value);
        return { hp: next, applied, kills: next === 0 };
    }
    if (buff.kind === "heal") {
        const applied = Math.min(buff.value, Math.max(0, maxHp - hp));
        return { hp: hp + applied, applied, kills: false };
    }
    return { hp, applied: 0, kills: false };
}

/** 攻击加成：attack-up buff 的 value 之和（普攻/伤害技能结算时叠加到攻击力）。 */
export function autoBattleBuffAttackBonus(instances: readonly AutoBattleBuffInstance[]): number {
    return instances.reduce((sum, instance) => (instance.def.kind === "attack-up" ? sum + instance.def.value : sum), 0);
}

/** 防御加成：defense-up buff 的 value 之和（受击时从伤害中扣减，下限 0）。 */
export function autoBattleBuffDefenseBonus(instances: readonly AutoBattleBuffInstance[]): number {
    return instances.reduce((sum, instance) => (instance.def.kind === "defense-up" ? sum + instance.def.value : sum), 0);
}

/**
 * 回合推进：全部 buff 剩余回合减 1，归零移除。调用方在每回合开始执行，
 * 返回新列表（纯函数，不修改入参）。
 */
export function tickAutoBattleBuffs(instances: readonly AutoBattleBuffInstance[]): readonly AutoBattleBuffInstance[] {
    return instances
        .map((instance) => ({ def: instance.def, remaining: instance.remaining - 1 }))
        .filter((instance) => instance.remaining > 0);
}
