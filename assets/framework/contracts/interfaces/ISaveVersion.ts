/**
 * 存档 schema 版本品牌类型：运行期为自增正整数，编译期与 number 区分。
 * 取值/比较经 Number() 收窄（branded 类型无运行期值）。
 * 说明：`extends Number` 是 branded 的惯用形态（TS 无 number 原始类型的
 * extends），故豁免 no-wrapper-object-types。
 */
// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
export interface ISaveVersion extends Number {
    /** 品牌标记：仅编译期存在，无运行期值。 */
    readonly __saveVersion: unique symbol;
}
