import type { EnumLogLevel } from "../enums/EnumLogLevel";
import type { ILogContext } from "./ILogContext";

/** 一条结构化日志记录：级别、消息、时间戳、作用域与上下文。 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ILogRecord extends Readonly<{
    level: EnumLogLevel;
    message: string;
    timestamp: number;
    scope: string;
    context: ILogContext;
    error?: Error & { readonly cause?: unknown };
}> {}
