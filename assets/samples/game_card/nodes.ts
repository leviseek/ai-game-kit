/**
 * 卡牌对局 FGUI 节点名契约：CardBattleView 组件的子节点名。fgui-designer 产出
 * CardGame 包 XML 时必须与此处对齐（绑定表按名寻址，拼错即静默失败）。与
 * AutoBattle 包同名节点（txt_result/btn_restart）属不同组件契约，不合并。
 */

/** 玩家生命值文本节点。 */
export const PLAYER_HP_TEXT_NODE = "txt_player_hp";
/** 敌方生命值文本节点。 */
export const ENEMY_HP_TEXT_NODE = "txt_enemy_hp";
/** 法力值文本节点。 */
export const MANA_TEXT_NODE = "txt_mana";
/** 敌方生命值进度条节点。 */
export const ENEMY_HP_BAR_NODE = "bar_enemy_hp";
/** 手牌按钮节点（索引 0..2）。 */
export const HAND_CARD_BUTTONS = ["btn_card_0", "btn_card_1", "btn_card_2"] as const;
/** 结束回合按钮节点。 */
export const END_TURN_BUTTON_NODE = "btn_end_turn";
/** 对局结果（胜利/战败）文本节点。 */
export const RESULT_TEXT_NODE = "txt_result";
/** 重开按钮节点。 */
export const RESTART_BUTTON_NODE = "btn_restart";
