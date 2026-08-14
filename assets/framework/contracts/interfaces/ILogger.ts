import type { ILogContext } from "./ILogContext";

/**
 * 结构化日志契约。ILogRecord.scope 为点分作用域（如 "app:inventory"）；
 * child 返回继承父 scope 与 context 的新 Logger。
 */
export interface ILogger {
    debug(message: string, context?: ILogContext): void;
    info(message: string, context?: ILogContext): void;
    warn(message: string, context?: ILogContext): void;
    error(message: string, context?: ILogContext, error?: Error): void;
    child(scope: string, context?: ILogContext): ILogger;
}
