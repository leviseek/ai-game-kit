/**
 * 统一时间来源契约。now() 返回当前计时的值，单位约定为毫秒。
 */
export interface ITimeSource {
    now(): number;
}
