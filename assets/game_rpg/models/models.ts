/**
 * RPG 品类业务模型：角色/技能/任务等业务模型仅存在于游戏层，
 * 框架层不出现对应类型（负向边界断言由 2.1 测试锁定）。
 */

/** RPG 输入 action：类型化 gameplay action，action 标识由游戏层定义。 */
export type RpgAction = "move" | "interact" | "confirm" | "cancel";

/** 跨场景玩家状态：写入后可在场景切换间恢复。 */
export interface RpgPlayerState {
    readonly sceneId: string;
    readonly level: number;
    readonly gold: number;
}

/** 代表性角色模型：业务模型留在游戏层的最小形态。 */
export interface RpgCharacter {
    readonly id: string;
    readonly name: string;
    readonly level: number;
}

/** 代表性技能模型。 */
export interface RpgSkill {
    readonly id: string;
    readonly name: string;
    readonly power: number;
}

/** 代表性任务模型。 */
export interface RpgQuest {
    readonly id: string;
    readonly title: string;
    readonly done: boolean;
}

/** 代表性 FairyGUI route：路由标识由游戏层定义，呈现由适配层完成。 */
export const RPG_STATUS_ROUTE = "rpg/status";

/** 代表性 route 的 ViewModel：只承载呈现数据，不涉及渲染实现。 */
export interface RpgStatusViewModel {
    readonly hp: number;
    readonly gold: number;
    readonly quests: readonly string[];
}
