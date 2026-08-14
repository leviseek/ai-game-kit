/**
 * 配置键品牌类型：运行期为普通字符串，编译期与 string 区分。
 * 用于阻止把任意字符串误当配置键混用；取值/比较经 String() 或
 * `as unknown as string` 收窄（branded 类型无运行期值）。
 * 说明：`extends String` 是 branded 的惯用形态（TS 无 string 原始类型的
 * extends），故豁免 no-wrapper-object-types。
 */
// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
export interface IConfigKey extends String {
    /** 品牌标记：仅编译期存在，无运行期值。 */
    readonly __configKey: unique symbol;
}
