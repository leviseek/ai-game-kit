import type { ILogContext } from "../../contracts/interfaces/ILogContext";
import type { ILogRecord } from "../../contracts/interfaces/ILogRecord";

const SENSITIVE_KEY_PATTERNS = [/token$/i, /secret$/i, /password$/i, /api[._-]?key$/i];

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

    // 非普通对象（Date、Map、类实例、Error）原样透传：它们无法被安全遍历，
    // 其字符串形式由调用方负责。注意这里包含 Map——虽然技术上可迭代，但
    // 有意保持一致而不做过滤。
    if (!isPlainObject(value) && !Array.isArray(value)) {
        return value;
    }

    if (seen.has(value)) {
        return CIRCULAR;
    }

    seen.add(value);

    const result = Array.isArray(value) ? value.map((item) => redactValue(item, seen)) : redactContext(value as ILogContext, seen);

    seen.delete(value);

    return result;
}

export function redactContext(context: ILogContext, seen = new Set<object>()): ILogContext {
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(context)) {
        result[key] = isSensitiveKey(key) ? REDACTED : redactValue(context[key], seen);
    }

    return result;
}

export function redactRecord(record: ILogRecord): ILogRecord {
    return {
        ...record,
        context: redactContext(record.context),
        error: record.error,
    };
}
