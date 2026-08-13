import type { LogContext, Logger, LogRecord } from "../../contracts/logging/Logger";
import { createScopedLogger, type LogRecordFilter } from "./ScopedLogger";
import { redactRecord } from "./redact";

interface ConsoleOutput {
    debug(record: LogRecord): void;
    info(record: LogRecord): void;
    warn(record: LogRecord): void;
    error(record: LogRecord): void;
}

/**
 * 默认日志实现：每条记录先经 redactRecord 脱敏（敏感字段替换为占位符），
 * 再按级别输出到指定 output（默认 console）。
 */
export class ConsoleLogger implements Logger {
    private readonly delegate: Logger;

    public constructor(output: ConsoleOutput = console, scope = "", context: LogContext = {}, filter: LogRecordFilter = redactRecord) {
        this.delegate = createScopedLogger((record) => output[record.level](record), scope, context, filter);
    }

    public debug(message: string, context?: LogContext): void {
        this.delegate.debug(message, context);
    }

    public info(message: string, context?: LogContext): void {
        this.delegate.info(message, context);
    }

    public warn(message: string, context?: LogContext): void {
        this.delegate.warn(message, context);
    }

    public error(message: string, context?: LogContext, error?: Error): void {
        this.delegate.error(message, context, error);
    }

    public child(scope: string, context?: LogContext): Logger {
        return this.delegate.child(scope, context);
    }
}
