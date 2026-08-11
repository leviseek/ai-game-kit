/**
 * DevOverlay 包 FGUI 节点名契约：DevOverlayBall 组件根（"ball"）与其直接子
 * 面板（"panel"）的节点名。fgui-designer 产出 DevOverlay 包 XML 时必须与此处
 * 对齐（运行时 node(name) 按名寻址，拼错即静默失败）。framework 层持有该契约，
 * boot/dev 层经 re-export 消费，避免跨层反向依赖。
 */

/** DevOverlayBall 组件根节点名（悬浮球本身）。 */
export const DEV_BALL_NODE = "ball";
/** DevOverlayBall 组件内信息面板子节点名。 */
export const DEV_PANEL_NODE = "panel";
