import type { IModule } from "../../../framework";
import type { MapGrid, GridKey } from "./grid";

/** 移动解析结果：路径 steps 与最终落点（destination）。 */
export interface AutoBattleMovePath {
    /** 逐格路径（不含起点，含终点）；为空表示原地（射程内或无法移动）。 */
    readonly steps: readonly GridKey[];
    /** 最终落点：原地时等于起点。 */
    readonly destination: GridKey;
}

/** 解析 `row:col` 网格格：非法返回 undefined。 */
function parseGridKey(gridKey: string): { readonly row: number; readonly col: number } | undefined {
    const match = /^(\d+):(\d+)$/.exec(gridKey);
    if (match === null) {
        return undefined;
    }
    return { row: Number(match[1]), col: Number(match[2]) };
}

/** 曼哈顿距离：|Δrow| + |Δcol|（移动前移的射程判定依据）。 */
export function manhattanDistance(from: GridKey, to: GridKey): number {
    const a = parseGridKey(from);
    const b = parseGridKey(to);
    if (a === undefined || b === undefined) {
        return Number.POSITIVE_INFINITY;
    }
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

/**
 * 向目标前进一步：行不同时优先向目标行推进一行（列不变），行相同则沿目标列
 * 方向推进一列。返回目标格；越界（行/列低于 0）或解析失败返回 undefined。
 * 跨排推进使中/后排单位对前排目标可达（修复"只守不攻"：非同排不再原地不动）；
 * 上界越界由调用方 grid.move 校验拒绝，路径解析仅需下界守卫。
 */
function stepToward(current: GridKey, target: GridKey): GridKey | undefined {
    const cur = parseGridKey(current);
    const tgt = parseGridKey(target);
    if (cur === undefined || tgt === undefined) {
        return undefined;
    }
    if (cur.row !== tgt.row) {
        const nextRow = cur.row + (tgt.row > cur.row ? 1 : -1);
        if (nextRow < 0) {
            return undefined;
        }
        return `${nextRow}:${cur.col}`;
    }
    const nextCol = cur.col + (tgt.col > cur.col ? 1 : -1);
    if (nextCol < 0) {
        return undefined;
    }
    return `${cur.row}:${nextCol}`;
}

/**
 * 移动路径解析（纯函数）：攻击前若与目标曼哈顿距离超过 attackRange，沿最短
 * 路径逐格前移——优先向目标行推进（跨排可达），行对齐后沿列方向推进，直到
 * 满足射程或到达边界。每步校验目标格空闲（grid.isFree），遇占用停在当前格。
 * - 射程内（manhattan <= attackRange）返回空 steps、destination=起点（原地）。
 * - 超射程但推进受限（占用/边界）返回 destination=起点（不移动）。
 * 无副作用、无随机，同输入同输出（确定性）；battle 消费返回路径执行 grid.move。
 */
export function resolveMovePath(grid: MapGrid, actorGrid: GridKey, targetGrid: GridKey, attackRange: number): AutoBattleMovePath {
    if (manhattanDistance(actorGrid, targetGrid) <= attackRange) {
        return { steps: [], destination: actorGrid };
    }

    const steps: GridKey[] = [];
    let current = actorGrid;
    for (let guard = 0; guard < grid.rows * grid.cols; guard += 1) {
        if (manhattanDistance(current, targetGrid) <= attackRange) {
            break;
        }
        const next = stepToward(current, targetGrid);
        if (next === undefined || !grid.isFree(next)) {
            // 越界/占用：停在当前格，不移动
            break;
        }
        steps.push(next);
        current = next;
    }
    return { steps, destination: current };
}

/**
 * 移动解析模块：纯函数模块，只登记引用使其进入装配清单，
 * 生命周期无副作用（对齐 formation/skills/effects 纯函数模块登记语义）。
 */
export function createAutoBattleMoveModule(): IModule {
    return {
        id: "auto_battle.move",
        dependencies: [],
        start: () => {
            // 纯函数模块无共享状态；start 只是让模块进入装配清单
            void resolveMovePath;
        },
    };
}
