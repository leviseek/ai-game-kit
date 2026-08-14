import type { ILogContext } from "../../contracts/interfaces/ILogContext";
import type { ILogger } from "../../contracts/interfaces/ILogger";
import type { ILogRecord } from "../../contracts/interfaces/ILogRecord";
import { createScopedLogger, type LogRecordFilter } from "./ScopedLogger";
import { redactRecord } from "./redact";

interface ConsoleOutput {
    debug(record: ILogRecord): void;
    info(record: ILogRecord): void;
    warn(record: ILogRecord): void;
    error(record: ILogRecord): void;
}

/**
 * 默认日志实现：每条记录先经 redactRecord 脱敏（敏感字段替换为占位符），
 * 再按级别输出到指定 output（默认 console）。
 */
export class ConsoleLogger implements ILogger {
    private readonly delegate: ILogger;

    public constructor(output: ConsoleOutput = console, scope = "", context: ILogContext = {}, filter: LogRecordFilter = redactRecord) {
        this.delegate = createScopedLogger((record) => output[record.level](record), scope, context, filter);
    }

    public debug(message: string, context?: ILogContext): void {
        this.delegate.debug(message, context);
    }

    public info(message: string, context?: ILogContext): void {
        this.delegate.info(message, context);
    }

    public warn(message: string, context?: ILogContext): void {
        this.delegate.warn(message, context);
    }

    public error(message: string, context?: ILogContext, error?: Error): void {
        this.delegate.error(message, context, error);
    }

    public child(scope: string, context?: ILogContext): ILogger {
        return this.delegate.child(scope, context);
    }
}
