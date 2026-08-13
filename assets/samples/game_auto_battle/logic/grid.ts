import type { AutoBattleSide } from "../models";

/** 布阵区行数：战场网格的行数，也是每侧布阵区的行数。 */
export const FORMATION_GRID_ROWS = 3;
/** 布阵区列数：每侧布阵区的列数（敌方左半、己方右半对称）。 */
export const FORMATION_GRID_COLS = 3;
/**
 * 布阵区容量：每侧可放置单位的上限格数（3×3=9）。与上阵上限（MAX_TEAM_SIZE）
 * 语义分离——布阵区允许空余格，上阵数仍受 MAX_TEAM_SIZE 约束。
 */
export const FORMATION_GRID_SIZE = FORMATION_GRID_ROWS * FORMATION_GRID_COLS;
/** 战场网格总列数：敌左己右各半场（延续 D2），每侧 FORMATION_GRID_COLS 列。 */
export const BATTLEFIELD_COLS = FORMATION_GRID_COLS * 2;

/** 网格格 key：`row:col` 字符串，行/列均为非负整数。 */
export type GridKey = string;

/** 平铺网格：rows×cols 格位 + 占用表，操作是确定性纯函数结算（无随机/可变依赖）。 */
export interface MapGrid {
    readonly rows: number;
    readonly cols: number;
    /** 某侧布阵区格清单（己方右半、敌方左半），供开战实例化时选格。 */
    formationCells(side: AutoBattleSide): readonly string[];
    /** 格内单位 id；格未占用返回 undefined。 */
    occupiedBy(gridKey: string): string | undefined;
    /** 格是否空闲。 */
    isFree(gridKey: string): boolean;
    /** 单位当前所在格；未放置返回 undefined。 */
    gridOf(unitId: string): string | undefined;
    /** 放置单位到格：格被占用或单位已在别处返回 false，否则占用并返回 true。 */
    place(unitId: string, gridKey: string): boolean;
    /** 释放单位所在格：单位未放置返回 false。 */
    release(unitId: string): boolean;
    /**
     * 移动单位到目标格：释放 + 放置一步完成，避免双索引中间态不一致。
     * 目标格被占用、非法/越界或单位未放置返回 false（位置不变）。
     */
    move(unitId: string, gridKey: string): boolean;
}

function keyOf(row: number, col: number): string {
    return `${row}:${col}`;
}

/**
 * 解析并校验 gridKey：必须为 `row:col` 非负整数，且落在 rows×cols 网格内；
 * 非法或越界返回 undefined（调用方据此拒绝，保持网格纯函数的确定性）。
 */
function parseGridKey(gridKey: string, rows: number, cols: number): { readonly row: number; readonly col: number } | undefined {
    const match = /^(\d+):(\d+)$/.exec(gridKey);
    if (match === null) {
        return undefined;
    }
    const row = Number(match[1]);
    const col = Number(match[2]);
    if (row >= rows || col >= cols) {
        return undefined;
    }
    return { row, col };
}

/**
 * 创建平铺战场网格：占用表用双 Map 双向索引（gridKey↔unitId），place/release
 * 原子更新，避免移动/换位时出现不一致。布阵区列区间基于网格 cols 推导（敌方
 * 左半 [0, FORMATION_GRID_COLS)、己方右半 [cols-FORMATION_GRID_COLS, cols)），
 * 与网格宽度解耦；默认 cols=BATTLEFIELD_COLS 时两侧各 3 列、互不重叠。
 */
export function createMapGrid(rows = FORMATION_GRID_ROWS, cols = BATTLEFIELD_COLS): MapGrid {
    const occupied = new Map<string, string>();
    const unitGrid = new Map<string, string>();

    return {
        get rows() {
            return rows;
        },
        get cols() {
            return cols;
        },
        formationCells(side) {
            const colOffset = side === "ally" ? cols - FORMATION_GRID_COLS : 0;
            const cells: string[] = [];
            for (let row = 0; row < rows; row += 1) {
                for (let col = colOffset; col < colOffset + FORMATION_GRID_COLS; col += 1) {
                    if (col >= cols) {
                        break;
                    }
                    cells.push(keyOf(row, col));
                }
            }
            return cells;
        },
        occupiedBy(gridKey) {
            return occupied.get(gridKey);
        },
        isFree(gridKey) {
            return !occupied.has(gridKey);
        },
        gridOf(unitId) {
            return unitGrid.get(unitId);
        },
        place(unitId, gridKey) {
            // 非法/越界 gridKey 拒绝：网格只接受落在 rows×cols 内的格
            if (parseGridKey(gridKey, rows, cols) === undefined) {
                return false;
            }
            if (occupied.has(gridKey) || unitGrid.has(unitId)) {
                return false;
            }
            occupied.set(gridKey, unitId);
            unitGrid.set(unitId, gridKey);
            return true;
        },
        release(unitId) {
            const gridKey = unitGrid.get(unitId);
            if (gridKey === undefined) {
                return false;
            }
            occupied.delete(gridKey);
            unitGrid.delete(unitId);
            return true;
        },
        move(unitId, gridKey) {
            // 目标格非法/越界拒绝（与 place 同校验）；单位未放置或目标被占用返回 false
            if (parseGridKey(gridKey, rows, cols) === undefined) {
                return false;
            }
            const from = unitGrid.get(unitId);
            if (from === undefined || occupied.has(gridKey)) {
                return false;
            }
            // 原子更新：先移除原占用再占新格，双索引同步，无中间态
            occupied.delete(from);
            occupied.set(gridKey, unitId);
            unitGrid.set(unitId, gridKey);
            return true;
        },
    };
}
