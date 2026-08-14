/** 输入上下文标识品牌类型：运行期为普通字符串（如 `ui`、`gameplay`）。 */
// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
export interface IInputContextId extends String {
    /** 品牌标记：仅编译期存在，无运行期值。 */
    readonly __inputContextId: unique symbol;
}
