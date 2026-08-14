import type { IConfigKey } from "./IConfigKey";

/**
 * 类型化读取声明（typed read declaration）：调用方在读取时声明期望的类型与形状。
 * parse 负责把原始值解析/校验为声明类型；形状不符抛 ConfigTypeMismatchError，
 * 内容无法按期望解析抛 ConfigParseError。不依赖 cc/fgui，不触达存档后端。
 */
export interface IConfigReadType<T> {
    /** 声明类型名，用于诊断信息。 */
    readonly name: string;
    /** 解析/校验原始值为声明类型；失败抛类型化错误。 */
    readonly parse: (key: IConfigKey, raw: unknown) => T;
}
