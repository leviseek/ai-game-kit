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

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext, error?: Error): void;
  child(scope: string, context?: LogContext): Logger;
}
