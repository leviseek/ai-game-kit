import type { AutoBattleSide } from "../models";

/**
 * 布阵区行数：每侧布阵区纵向最大行数。4-3-4 布阵（前排 4 格、中排 3 格、
 * 后排 4 格 = 11 格）下，前排/后排占满 4 行，中排缺顶格（3 行）。
 */
export const FORMATION_GRID_ROWS = 4;
/** 布阵区列数（排数）：每侧 3 排（贴中线为前排，往后依次中排、后排）。 */
export const FORMATION_GRID_COLS = 3;
/**
 * 布阵区容量：每侧可放置单位的上限格数（4+3+4=11）。与上阵上限
 * （MAX_TEAM_SIZE）语义分离——布阵区允许空余格，上阵数仍受 MAX_TEAM_SIZE
 * 约束。槽位序 = 列优先（前排 0-3 → 中排 4-6 → 后排 7-10，每排自上而下）。
 */
export const FORMATION_GRID_SIZE = 11;
/** 战场网格总列数：11 列（列高 3-4-3-4-…-3 交替，共 38 格，见 BattlefieldSlotsCom）。 */
export const BATTLEFIELD_COLS = 11;
/** 敌方布阵区起始列（0 基）：敌方占战场列 1-3，前排贴中线（列 3）。 */
export const FORMATION_ENEMY_BASE_COL = 1;
/** 己方布阵区起始列（0 基）：己方占战场列 7-9，前排贴中线（列 7）。 */
export const FORMATION_ALLY_BASE_COL = 7;

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
    /** 格是否空闲且可走（非槽位格恒为 false）。 */
    isFree(gridKey: string): boolean;
    /** 单位当前所在格；未放置返回 undefined。 */
    gridOf(unitId: string): string | undefined;
    /** 放置单位到格：格被占用、非槽位格或单位已在别处返回 false，否则占用并返回 true。 */
    place(unitId: string, gridKey: string): boolean;
    /** 释放单位所在格：单位未放置返回 false。 */
    release(unitId: string): boolean;
    /**
     * 移动单位到目标格：释放 + 放置一步完成，避免双索引中间态不一致。
     * 目标格被占用、非法/越界/非槽位格或单位未放置返回 false（位置不变）。
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
 * 布阵区相对格（row 0..FORMATION_GRID_ROWS-1, col 0..FORMATION_GRID_COLS-1）→
 * 槽位号：列优先（前排 0-3 → 中排 4-6 → 后排 7-10，每排自上而下）。中排缺顶格
 * （row 0 & col 1）或越界返回 undefined（换位目标非法时失败，位置不变）。
 */
export function formationSlotOf(row: number, col: number): number | undefined {
    if (row < 0 || row >= FORMATION_GRID_ROWS || col < 0 || col >= FORMATION_GRID_COLS) {
        return undefined;
    }
    if (col === 1 && row === 0) {
        return undefined;
    }
    return col === 0 ? row : col === 1 ? row + 3 : row + 7;
}

/**
 * 创建平铺战场网格：占用表用双 Map 双向索引（gridKey↔unitId），place/release
 * 原子更新，避免移动/换位时出现不一致。逻辑网格为 4×11 全矩形，但可走格只含
 * 拼接槽位真实存在的 38 格（列高 3-4-3-4-…-3 交替：奇数列 4 行、偶数列缺顶行，
 * 与 BattlefieldSlotsCom 渲染一致）——place/move/isFree 均拒绝非槽位格，单位
 * 只可能站在已渲染的六边形槽位上，不会飘到无槽位处。布阵区固定占敌方列 1-3、
 * 己方列 7-9（4-3-4 共 11 格，中间留空列 4-6，布阵阶段两侧不贴边；开战后射程
 * 不够才前移）。
 */
export function createMapGrid(rows = FORMATION_GRID_ROWS, cols = BATTLEFIELD_COLS): MapGrid {
    const occupied = new Map<string, string>();
    const unitGrid = new Map<string, string>();

    /** 槽位格判定：奇数列 4 行（行 0..3），偶数列 3 行（行 1..3，缺顶行）。 */
    const isWalkableCell = (row: number, col: number): boolean => col % 2 === 1 || row >= 1;

    /** 解析并校验 gridKey 落在 rows×cols 内且为可走槽位格；否则返回 undefined。 */
    const parseWalkableKey = (gridKey: string): { readonly row: number; readonly col: number } | undefined => {
        const cell = parseGridKey(gridKey, rows, cols);
        if (cell === undefined || !isWalkableCell(cell.row, cell.col)) {
            return undefined;
        }
        return cell;
    };

    return {
        get rows() {
            return rows;
        },
        get cols() {
            return cols;
        },
        formationCells(side) {
            const cells: string[] = [];
            // 4-3-4 布阵：列优先（前排 → 中排 → 后排，每排自上而下）；中排缺顶格。
            // 敌方前排贴中线（列 3），己方前排贴中线（列 7），两侧对称留出中线空列。
            for (let localCol = 0; localCol < FORMATION_GRID_COLS; localCol += 1) {
                for (let row = 0; row < FORMATION_GRID_ROWS; row += 1) {
                    if (localCol === 1 && row === 0) {
                        continue;
                    }
                    const col = side === "ally" ? FORMATION_ALLY_BASE_COL + localCol : FORMATION_ENEMY_BASE_COL + (FORMATION_GRID_COLS - 1 - localCol);
                    cells.push(keyOf(row, col));
                }
            }
            return cells;
        },
        occupiedBy(gridKey) {
            return occupied.get(gridKey);
        },
        isFree(gridKey) {
            // 非槽位格（未渲染）视为不可走：寻路/占用判定统一走可走格
            if (parseWalkableKey(gridKey) === undefined) {
                return false;
            }
            return !occupied.has(gridKey);
        },
        gridOf(unitId) {
            return unitGrid.get(unitId);
        },
        place(unitId, gridKey) {
            // 非法/越界/非槽位格拒绝：网格只接受可走格
            if (parseWalkableKey(gridKey) === undefined) {
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
            // 目标格非法/越界/非槽位拒绝（与 place 同校验）；单位未放置或目标被占用返回 false
            if (parseWalkableKey(gridKey) === undefined) {
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
