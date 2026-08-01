import type {
  LogContext,
  Logger,
  LogRecord,
} from "../../contracts/logging/Logger";
import { createScopedLogger } from "./ScopedLogger";

interface ConsoleOutput {
  debug(record: LogRecord): void;
  info(record: LogRecord): void;
  warn(record: LogRecord): void;
  error(record: LogRecord): void;
}

export class ConsoleLogger implements Logger {
  private readonly delegate: Logger;

  public constructor(
    output: ConsoleOutput = console,
    scope = "",
    context: LogContext = {},
  ) {
    this.delegate = createScopedLogger(
      (record) => output[record.level](record),
      scope,
      context,
    );
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
