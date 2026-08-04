export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Readonly<Record<string, unknown>>;

export type LogRecord = Readonly<{
  level: LogLevel;
  message: string;
  timestamp: number;
  scope: string;
  context: LogContext;
  error?: Error & { readonly cause?: unknown };
}>;

/**
 * 结构化日志契约。LogRecord.scope 为点分作用域（如 "app:inventory"）；
 * child 返回继承父 scope 与 context 的新 Logger。
 */
export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext, error?: Error): void;
  child(scope: string, context?: LogContext): Logger;
}
