/**
 * 回合制卡牌品类业务模型：卡组/回合/效果结算等业务规则仅存在于游戏层，
 * 框架层不出现对应类型（负向边界断言由 3.1 测试锁定）。
 */

/** 回合阶段：玩家回合、敌方回合、终局。 */
export type CardTurnPhase = "player" | "enemy" | "over";

/** 卡牌输入 action：类型化 gameplay action，action 标识由游戏层定义。 */
export type CardAction = "play-card-0" | "play-card-1" | "play-card-2" | "end-turn";

/** 卡牌数值配置：成本与伤害由配置表驱动。 */
export interface CardConfig {
    readonly id: string;
    readonly name: string;
    readonly cost: number;
    readonly damage: number;
}

/** 回合流战场状态：出牌结算结果由状态机与可控时钟共同决定。 */
export interface CardBattleState {
    readonly turn: number;
    readonly phase: CardTurnPhase;
    readonly playerHp: number;
    readonly enemyHp: number;
    readonly mana: number;
    readonly hand: readonly CardConfig[];
    /** 终局结果：战斗结束后的胜败标记；未终局为 undefined。 */
    readonly result: "win" | "lose" | undefined;
}

/** 代表性 FairyGUI route：路由标识由游戏层定义，呈现由适配层完成。 */
export const CARD_BATTLE_ROUTE = "card/battle";

/** 代表性 route 的 ViewModel：只承载呈现数据，不涉及渲染实现。 */
export interface CardBattleViewModel {
    readonly turn: number;
    readonly phase: CardTurnPhase;
    readonly playerHp: number;
    readonly enemyHp: number;
    readonly mana: number;
    readonly hand: readonly CardConfig[];
}
