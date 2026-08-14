import type { AutoBattleSkillCondition } from "../models";
import type { AutoBattleUnitView } from "./formation";

/**
 * 技能条件判定纯函数：按条件类型检查施法者（或目标选择上下文）是否满足。
 * - self-hp-ratio：施法者 HP 比例低于阈值 value（0..1）时满足（残血才放）
 * - target-position：施法者处于指定站位（value 为站位名）时满足
 * - always：恒满足（无条件技能的显式形态）
 * 返回是否满足；条件值缺失时按不满足处理（保守拒绝，避免误放）。
 */
export function resolveAutoBattleSkillCondition(condition: AutoBattleSkillCondition, actor: AutoBattleUnitView): boolean {
    if (condition.kind === "always") {
        return true;
    }
    if (condition.kind === "self-hp-ratio") {
        const threshold = condition.value;
        if (typeof threshold !== "number" || actor.maxHp <= 0) {
            return false;
        }
        return actor.hp / actor.maxHp < threshold;
    }
    if (condition.kind === "target-position") {
        return condition.value === actor.position;
    }
    return false;
}
