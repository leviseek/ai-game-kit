import { MAX_TEAM_SIZE } from "./config";
import type { AutoBattleLineup } from "../models";

/** 编队编辑动作：填充/替换指定槽，或卸下指定槽。 */
export type LineupAction =
    | { readonly type: "fill"; readonly slot: number; readonly heroId: string }
    | { readonly type: "remove"; readonly slot: number };

/**
 * 编队 reducer：纯函数状态变换，返回新的 AutoBattleLineup（不可变，输入不被
 * 修改）。槽位越界（< 0 或 >= 上阵上限）视为拒绝——返回原对象（引用不变），
 * 给交互层可预期的拒绝语义。fill 保证英雄唯一：同一英雄已占别的槽时先清空该
 * 槽再填入目标槽。slot 语义 = 定长编队槽位（含空槽），与开战实例化时的压缩
 * index（只含已上阵序）解耦（见 design.md D1 衔接说明）。
 */
export function editLineup(
    lineup: AutoBattleLineup,
    action: LineupAction,
): AutoBattleLineup {
    const slot = action.slot;
    if (slot < 0 || slot >= MAX_TEAM_SIZE) {
        return lineup;
    }

    if (action.type === "remove") {
        if (lineup.slots[slot] === null) {
            return lineup;
        }
        const next = [...lineup.slots];
        next[slot] = null;
        return { slots: next };
    }

    const next = [...lineup.slots];
    const existing = next.indexOf(action.heroId);
    if (existing !== -1 && existing !== slot) {
        next[existing] = null;
    }
    // 目标槽已是该英雄：无实际变化，返回原对象保持幂等
    if (next[slot] === action.heroId) {
        return lineup;
    }
    next[slot] = action.heroId;
    return { slots: next };
}
