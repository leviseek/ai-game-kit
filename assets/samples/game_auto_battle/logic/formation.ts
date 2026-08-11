import type { Module } from "../../../framework";
import type {
    AutoBattlePosition,
    AutoBattleSide,
} from "../models";

const SIDE_ORDER: Readonly<Record<AutoBattleSide, number>> = {
    ally: 0,
    enemy: 1,
};

const POSITION_ORDER: Readonly<Record<AutoBattlePosition, number>> = {
    front: 0,
    mid: 1,
    back: 2,
};

/**
 * 阵列查询视图：战斗内部可变单位实现该结构，阵列纯函数只读消费，
 * 避免把内部可变状态类型泄漏到查询接口。
 */
export interface AutoBattleUnitView {
    readonly id: string;
    readonly side: AutoBattleSide;
    readonly position: AutoBattlePosition;
    readonly index: number;
    readonly maxHp: number;
    readonly speed: number;
    readonly hp: number;
}

/** 存活判定：HP 大于 0 视为存活。 */
export function isAutoBattleAlive(unit: AutoBattleUnitView): boolean {
    return unit.hp > 0;
}

/**
 * 速度稳定排序：按 speed 降序；同速以稳定次序（先己方后敌方、再队内阵列
 * 序号）保证确定性。每轮开始以存活单位快照调用一次，行动中不重排。
 */
export function sortAutoBattleOrder(
    units: readonly AutoBattleUnitView[],
): readonly AutoBattleUnitView[] {
    return [...units].sort(
        (left, right) =>
            right.speed - left.speed ||
            SIDE_ORDER[left.side] - SIDE_ORDER[right.side] ||
            left.index - right.index,
    );
}

/**
 * 前排优先目标选择：在敌方存活单位中按站位优先级 front > mid > back 选择，
 * 同排取阵列最靠前者；敌方全灭返回 undefined（行动退化为 no-op）。
 */
export function selectAutoBattleTarget(
    enemies: readonly AutoBattleUnitView[],
): AutoBattleUnitView | undefined {
    const alive = enemies.filter(isAutoBattleAlive);
    if (alive.length === 0) {
        return undefined;
    }
    return alive.reduce((best, current) => {
        const bestRank = POSITION_ORDER[best.position];
        const currentRank = POSITION_ORDER[current.position];
        if (currentRank < bestRank) {
            return current;
        }
        if (currentRank === bestRank && current.index < best.index) {
            return current;
        }
        return best;
    });
}

/**
 * 锁定优先目标解析：锁定目标仍存活时直接返回（锁定是前排优先之上的覆盖），
 * 否则回退前排优先重选（无锁定 / 锁定目标已死亡）。敌方全灭返回 undefined。
 * 治疗目标选择不走此函数（治疗与攻击锁定解耦）。
 */
export function resolveAutoBattleTarget(
    enemies: readonly AutoBattleUnitView[],
    lockedTargetId: string | null,
): AutoBattleUnitView | undefined {
    if (lockedTargetId !== null) {
        const locked = enemies.find(
            (unit) => unit.id === lockedTargetId && isAutoBattleAlive(unit),
        );
        if (locked !== undefined) {
            return locked;
        }
    }
    return selectAutoBattleTarget(enemies);
}

/**
 * 治疗目标选择：己方存活单位中 HP 比例最低者；无存活单位返回 undefined。
 */
export function selectAutoBattleHealTarget(
    allies: readonly AutoBattleUnitView[],
): AutoBattleUnitView | undefined {
    const alive = allies.filter(isAutoBattleAlive);
    if (alive.length === 0) {
        return undefined;
    }
    return alive.reduce((best, current) => {
        const bestRatio = best.hp / best.maxHp;
        const currentRatio = current.hp / current.maxHp;
        return currentRatio < bestRatio ? current : best;
    });
}

/**
 * 阵列模块：查询/排序/目标选择为纯函数，模块只登记引用使其进入装配清单，
 * 生命周期无副作用（对齐其它品类模块的登记语义）。
 */
export function createAutoBattleFormationModule(): Module {
    return {
        id: "auto_battle.formation",
        dependencies: [],
        start: () => {
            // 纯函数模块无共享状态；start 只是让模块进入装配清单
            void isAutoBattleAlive;
        },
    };
}
