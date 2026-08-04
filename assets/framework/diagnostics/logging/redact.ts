import type {
  LogContext,
  LogRecord,
} from "../../contracts/logging/Logger";

const SENSITIVE_KEY_PATTERNS = [
  /token$/i,
  /secret$/i,
  /password$/i,
  /api[._-]?key$/i,
];

const REDACTED = "[REDACTED]";
const CIRCULAR = "[Circular]";

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function redactValue(value: unknown, seen: Set<object>): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  if (seen.has(value)) {
    return CIRCULAR;
  }

  seen.add(value);
  const result = redactContext(value as LogContext, seen);
  seen.delete(value);

  return result;
}

export function redactContext(
  context: LogContext,
  seen = new Set<object>(),
): LogContext {
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(context)) {
    result[key] = isSensitiveKey(key)
      ? REDACTED
      : redactValue(context[key], seen);
  }

  return result;
}

export function redactRecord(record: LogRecord): LogRecord {
  return {
    ...record,
    context: redactContext(record.context),
    error: record.error,
  };
}
