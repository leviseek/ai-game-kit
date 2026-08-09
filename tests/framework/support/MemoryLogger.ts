import type {
    LogContext,
    Logger,
    LogRecord,
} from "../../../assets/framework";
import { createScopedLogger } from "../../../assets/framework/diagnostics/logging/ScopedLogger";

export class MemoryLogger implements Logger {
    private readonly recordStore: LogRecord[] = [];
    private readonly delegate: Logger;

    public constructor(scope = "", context: LogContext = {}) {
        this.delegate = createScopedLogger(
            (record) => this.recordStore.push(record),
            scope,
            context,
        );
    }

    public get records(): readonly LogRecord[] {
        return this.recordStore;
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
