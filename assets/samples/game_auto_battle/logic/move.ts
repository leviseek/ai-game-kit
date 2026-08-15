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

/** 蜂窝真实邻格（扁六边形贴边：纵向 (0,±1) 与横向 (±1,0) 恒邻；斜向贴边
 *  依列奇偶：偶数列向上一行斜移、奇数列向下一行斜移）。返回可走且空闲的邻格。 */
function walkableNeighbors(grid: MapGrid, key: GridKey): GridKey[] {
    const cell = parseGridKey(key);
    if (cell === undefined) {
        return [];
    }
    const { row, col } = cell;
    const candidates: Array<readonly [number, number]> = [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1],
    ];
    if (col % 2 === 0) {
        candidates.push([row - 1, col - 1], [row - 1, col + 1]);
    } else {
        candidates.push([row + 1, col - 1], [row + 1, col + 1]);
    }
    const neighbors: GridKey[] = [];
    for (const [nextRow, nextCol] of candidates) {
        const next = `${nextRow}:${nextCol}`;
        // isFree 已编码槽位格校验（非槽位格恒 false）+ 占用校验
        if (grid.isFree(next)) {
            neighbors.push(next);
        }
    }
    return neighbors;
}

/**
 * 移动路径解析（纯函数 BFS）：攻击前若与目标曼哈顿距离超过 attackRange，在
 * 可走槽位格（BattlefieldSlotsCom 渲染的 38 格）的蜂窝图上做最短路径搜索，取
 * 路径前 maxSteps 步（每次行动可移动格数，武将配置）。只走真实相邻格（蜂窝
 * 贴边，见 walkableNeighbors），不会踩到无槽位的"幽灵格"，也不会跨越非相邻
 * 位置。目标格被占用不影响搜索（占用格不可走，落在射程内最近可走格为止）。
 * - 射程内（manhattan <= attackRange）返回空 steps、destination=起点（原地）。
 * - 无可达路径（被占用/边界堵死）返回空 steps、destination=起点。
 * - 超射程但走不满 maxSteps（已进入射程）返回已走到的位置。
 * 无副作用、无随机，同输入同输出（确定性）；battle 消费返回路径执行 grid.move。
 */
export function resolveMovePath(grid: MapGrid, actorGrid: GridKey, targetGrid: GridKey, attackRange: number, maxSteps: number): AutoBattleMovePath {
    if (manhattanDistance(actorGrid, targetGrid) <= attackRange) {
        return { steps: [], destination: actorGrid };
    }

    // BFS：从起点逐层扩展，首个与目标曼哈顿距离 <= attackRange 的格即终点
    const prev = new Map<GridKey, GridKey>();
    const visited = new Set<GridKey>([actorGrid]);
    const queue: GridKey[] = [actorGrid];
    let goal: GridKey | undefined;
    while (queue.length > 0) {
        const current = queue.shift()!;
        if (manhattanDistance(current, targetGrid) <= attackRange) {
            goal = current;
            break;
        }
        for (const next of walkableNeighbors(grid, current)) {
            if (visited.has(next)) {
                continue;
            }
            visited.add(next);
            prev.set(next, current);
            queue.push(next);
        }
    }
    if (goal === undefined) {
        // 无可达射程内格：原地（不产生移动）
        return { steps: [], destination: actorGrid };
    }

    // 回溯路径（不含起点、含终点），按 maxSteps 截断
    const path: GridKey[] = [];
    let cursor: GridKey | undefined = goal;
    while (cursor !== undefined && cursor !== actorGrid) {
        path.push(cursor);
        cursor = prev.get(cursor);
    }
    const steps = path.reverse().slice(0, maxSteps);
    return { steps, destination: steps.length > 0 ? steps[steps.length - 1]! : actorGrid };
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
