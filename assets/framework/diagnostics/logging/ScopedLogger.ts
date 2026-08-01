import type {
  LogContext,
  Logger,
  LogLevel,
  LogRecord,
} from "../../contracts/logging/Logger";

export type LogRecordSink = (record: LogRecord) => void;

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
): Logger {
  const baseContext = { ...context };

  const write = (
    level: LogLevel,
    message: string,
    callContext: LogContext = {},
    error?: Error,
  ): void => {
    sink({
      level,
      message,
      timestamp: Date.now(),
      scope,
      context: { ...baseContext, ...callContext },
      error,
    });
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
      ),
  };
}
