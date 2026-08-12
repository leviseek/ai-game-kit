/**
 * 自动战斗战场 FGUI 节点名契约：AutoBattleView / UnitSlot / UnitHitFeedbackCom
 * 组件的子节点名。fgui-designer 产出组件 XML 时这些名字必须与下方常量对齐
 * （绑定表/动态映射按名寻址，拼错即静默失败）。同一 AutoBattle 包内页面
 * 固定节点与动态实例子节点统一在此；CardGame 等其它包的同名字节不归入。
 */

// ---- AutoBattleView 页面固定节点 ----
/** 回合数文本节点。 */
export const ROUND_TEXT_NODE = "txt_round";
/** 战斗日志文本节点。 */
export const LOG_TEXT_NODE = "txt_log";
/** 战斗结果（胜利/战败）文本节点。 */
export const RESULT_TEXT_NODE = "txt_result";
/** 重开按钮节点。 */
export const RESTART_BUTTON_NODE = "btn_restart";
/** 观战加速挡位按钮节点。 */
export const SPEED_BUTTON_NODE = "btn_speed";

// ---- 战场动态容器 ----
/** 动态单位实例容器节点名（UnitSlot 实例按 unit_{id} 挂载）。 */
export const UNIT_SLOT_CONTAINER = "container_units";
/** 命中反馈特效实例容器节点名。 */
export const FX_CONTAINER = "container_effects";

// ---- UnitSlot 组件内子节点 ----
/** 单位名称文本节点。 */
export const UNIT_NAME_NODE = "txt_name";
/** 单位生命值文本节点。 */
export const UNIT_HP_TEXT_NODE = "txt_hp";
/** 单位生命值进度条节点。 */
export const UNIT_HP_BAR_NODE = "bar_hp";
/** 单位能量进度条节点。 */
export const UNIT_ENERGY_BAR_NODE = "bar_energy";

// ---- UnitHitFeedbackCom 组件内子节点 ----
/** 命中反馈飘字文本节点。 */
export const FX_FLOAT_NODE = "fx_float";
/** 命中反馈闪白遮罩节点。 */
export const FX_FLASH_NODE = "fx_flash";
