import type {
  LogContext,
  LogRecord,
} from "../../contracts/logging/Logger";

const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /apikey/i,
];

const REDACTED = "[REDACTED]";

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function redactValue(value: unknown): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return redactContext(value as LogContext);
  }

  if (Array.isArray(value)) {
    return value.map(redactValue);
  }

  return value;
}

export function redactContext(context: LogContext): LogContext {
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(context)) {
    result[key] = isSensitiveKey(key) ? REDACTED : redactValue(context[key]);
  }

  return result;
}

export function redactRecord(record: LogRecord): LogRecord {
  return {
    ...record,
    context: redactContext(record.context),
  };
}
