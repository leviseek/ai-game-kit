import type {
  LogContext,
  Logger,
  LogLevel,
  LogRecord,
} from "../../contracts/logging/Logger";

export type LogRecordSink = (record: LogRecord) => void;

export type LogRecordFilter = (record: LogRecord) => LogRecord;

function joinScopes(parentScope: string, childScope: string): string {
  if (parentScope.length === 0) {
    return childScope;
  }

  if (childScope.length === 0) {
    return parentScope;
  }

  return `${parentScope}.${childScope}`;
}

export function createScopedLogger(
  sink: LogRecordSink,
  scope = "",
  context: LogContext = {},
  filter: LogRecordFilter = (record) => record,
): Logger {
  const baseContext = { ...context };

  const write = (
    level: LogLevel,
    message: string,
    callContext: LogContext = {},
    error?: Error,
  ): void => {
    sink(filter({
      level,
      message,
      timestamp: Date.now(),
      scope,
      context: { ...baseContext, ...callContext },
      error,
    }));
  };

  return {
    debug: (message, callContext) => write("debug", message, callContext),
    info: (message, callContext) => write("info", message, callContext),
    warn: (message, callContext) => write("warn", message, callContext),
    error: (message, callContext, error) =>
      write("error", message, callContext, error),
    child: (childScope, childContext = {}) =>
      createScopedLogger(
        sink,
        joinScopes(scope, childScope),
        { ...baseContext, ...childContext },
        filter,
      ),
  };
}
