import type { ILogContext } from "../../contracts/interfaces/ILogContext";
import type { ILogger } from "../../contracts/interfaces/ILogger";
import type { ILogRecord } from "../../contracts/interfaces/ILogRecord";
import { EnumLogLevel } from "../../contracts/enums/EnumLogLevel";

export type LogRecordSink = (record: ILogRecord) => void;

export type LogRecordFilter = (record: ILogRecord) => ILogRecord;

function joinScopes(parentScope: string, childScope: string): string {
    if (parentScope.length === 0) {
        return childScope;
    }

    if (childScope.length === 0) {
        return parentScope;
    }

    return `${parentScope}.${childScope}`;
}

/**
 * 创建作用域日志器。scope 为点分前缀，父 scope 为空串时直接用子 scope；
 * child 返回继承父 scope 与 baseContext、并沿用 filter 的新日志器；
 * filter 作用于每一条写入记录（默认透传）。
 */
export function createScopedLogger(sink: LogRecordSink, scope = "", context: ILogContext = {}, filter: LogRecordFilter = (record) => record): ILogger {
    const baseContext = { ...context };

    const write = (level: EnumLogLevel, message: string, callContext: ILogContext = {}, error?: Error): void => {
        sink(
            filter({
                level,
                message,
                timestamp: Date.now(),
                scope,
                context: { ...baseContext, ...callContext },
                error,
            }),
        );
    };

    return {
        debug: (message, callContext) => write(EnumLogLevel.Debug, message, callContext),
        info: (message, callContext) => write(EnumLogLevel.Info, message, callContext),
        warn: (message, callContext) => write(EnumLogLevel.Warn, message, callContext),
        error: (message, callContext, error) => write(EnumLogLevel.Error, message, callContext, error),
        child: (childScope, childContext = {}) => createScopedLogger(sink, joinScopes(scope, childScope), { ...baseContext, ...childContext }, filter),
    };
}
