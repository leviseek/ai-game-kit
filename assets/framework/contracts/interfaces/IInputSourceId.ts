/**
 * 底层输入源标识品牌类型：运行期为普通字符串（如 `keyboard.space`、
 * `gamepad.leftStickX`），编译期与 string 区分。取值经 String() 收窄。
 * 说明：`extends String` 是 branded 的惯用形态（TS 无 string 原始类型的
 * extends），故豁免 no-wrapper-object-types。
 */
// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
export interface IInputSourceId extends String {
    /** 品牌标记：仅编译期存在，无运行期值。 */
    readonly __inputSourceId: unique symbol;
}
