import type {
    AutoBattleUnit,
    AutoBattleUnitState,
} from "../models";
import type { AutoBattleUnitView } from "./formation";

/** 战斗内部可变单位：静态定义 + 可变 HP/能量 + 所在网格格，实现阵列查询视图结构。 */
export interface MutableUnit extends AutoBattleUnitView {
    readonly def: AutoBattleUnit;
    /**
     * 当前所在网格格（坐标真源在逻辑层）：开战由布阵区分配，移动/换位后由
     * battle 经 grid.move 更新。渲染经 gridToXY 单向消费。
     */
    gridKey: string;
    /** 可变 HP：覆盖视图只读声明，供行动结算写入。 */
    hp: number;
    energy: number;
    /** 可变锁定攻击目标：覆盖视图只读声明，普攻/伤害技能行动解析后写回。 */
    lockedTargetId: string | null;
}

/** 从静态定义构造战斗初始单位：满血零能量，只读字段委托 def 读取。 */
export function createMutableUnit(
    def: AutoBattleUnit,
    gridKey: string,
): MutableUnit {
    return {
        get id() {
            return def.id;
        },
        get side() {
            return def.side;
        },
        get position() {
            return def.position;
        },
        get index() {
            return def.index;
        },
        get maxHp() {
            return def.maxHp;
        },
        get speed() {
            return def.speed;
        },
        gridKey,
        def,
        hp: def.maxHp,
        energy: 0,
        lockedTargetId: null,
    };
}

/** 可变单位数组 → 状态快照数组：供战斗 state 与行动序列重建读取。 */
export function snapshotUnits(
    units: readonly MutableUnit[],
): readonly AutoBattleUnitState[] {
    return units.map((unit) => ({
        ...unit.def,
        hp: unit.hp,
        energy: unit.energy,
        gridKey: unit.gridKey,
        lockedTargetId: unit.lockedTargetId,
    }));
}
