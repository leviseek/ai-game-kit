import type {
  ConfigKey,
  ConfigReadType,
  ConfigTable,
  ReadonlyConfigSnapshot,
} from "../../contracts/config/Config";
import {
  ConfigMissingError,
  ConfigParseError,
  ConfigTypeMismatchError,
} from "./ConfigErrors";

// 以 `{`/`[` 开头（允许前导空白，与 JSON.parse 的宽容性一致）的字符串
// 按 JSON 结构化内容解析；其余字符串不视为可解析内容。
function isStructuredString(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  // ES2015 lib 无 trimStart，用正则去除前导空白
  const trimmed = value.replace(/^\s+/, "");
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

/**
 * 构造结构化类型声明（对象/数组）：接受纯对象/数组，或可解析为对应形状的
 * JSON 字符串。字符串以结构字符开头但解析失败属解析失败（ConfigParseError），
 * 其余形状不符属类型不匹配（ConfigTypeMismatchError）。
 * 解析产物在返回前深度冻结，与直接对象字段路径的只读语义保持一致。
 */
function createStructuredType<T>(
  name: string,
  matches: (raw: unknown) => raw is T,
): ConfigReadType<T> {
  return {
    name,
    parse(key, raw) {
      if (matches(raw)) {
        return raw;
      }

      if (isStructuredString(raw)) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch (cause) {
          throw new ConfigParseError(key, `invalid JSON for ${name}`, {
            cause,
          });
        }
        if (matches(parsed)) {
          return deepFreeze(parsed);
        }
        throw new ConfigTypeMismatchError(key, name);
      }

      throw new ConfigTypeMismatchError(key, name);
    },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/** 字符串类型声明：仅接受 string，形状不符抛 ConfigTypeMismatchError。 */
export const configString: ConfigReadType<string> = {
  name: "string",
  parse(key, raw) {
    if (typeof raw !== "string") {
      throw new ConfigTypeMismatchError(key, "string");
    }
    return raw;
  },
};

/** 数字类型声明：仅接受有限 number，形状不符抛 ConfigTypeMismatchError。 */
export const configNumber: ConfigReadType<number> = {
  name: "number",
  parse(key, raw) {
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      throw new ConfigTypeMismatchError(key, "number");
    }
    return raw;
  },
};

/** 布尔类型声明：仅接受 boolean，形状不符抛 ConfigTypeMismatchError。 */
export const configBoolean: ConfigReadType<boolean> = {
  name: "boolean",
  parse(key, raw) {
    if (typeof raw !== "boolean") {
      throw new ConfigTypeMismatchError(key, "boolean");
    }
    return raw;
  },
};

/** 对象类型声明：接受纯对象或可解析为对象的 JSON 字符串。 */
export const configObject: ConfigReadType<Record<string, unknown>> =
  createStructuredType("object", isPlainObject);

/** 数组类型声明：接受数组或可解析为数组的 JSON 字符串。 */
export const configArray: ConfigReadType<readonly unknown[]> =
  createStructuredType("array", isArray);

// 递归冻结对象与数组：配置装载后整体不可变，读取方拿到的快照与表共享同一份
// 冻结结构。用访问中的祖先 WeakSet 检测循环引用，避免递归栈溢出；
// 循环引用不是合法配置内容，以类型化错误拒绝（对齐 VersionedStorage 先例）。
function deepFreeze<T>(value: T, ancestors: WeakSet<object> = new WeakSet()): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (ancestors.has(value)) {
    throw new ConfigParseError("", "config content has a circular reference");
  }

  ancestors.add(value);
  Object.freeze(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item, ancestors);
    }
  } else {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key], ancestors);
    }
  }

  ancestors.delete(value);
  return value;
}

/** 配置表创建错误时的类型化错误基座：内容非纯对象时在装载入口拒绝。 */
function assertPlainObjectContent(content: unknown): asserts content is Record<string, unknown> {
  if (!isPlainObject(content)) {
    throw new ConfigParseError("", "config content is not a plain object");
  }
}

/**
 * 装载配置内容为不可变配置表。内容必须是纯对象；装载后深度冻结，
 * 读取按键返回类型化值。内容非纯对象抛 ConfigParseError，不产生部分状态。
 * 引擎无关，不依赖 cc/fgui，也不触达存档后端。
 */
export function createConfigTable(content: unknown): ConfigTable {
  assertPlainObjectContent(content);

  const entries = deepFreeze(content);

  function read<T>(
    key: ConfigKey,
    type: ConfigReadType<T>,
    defaultValue?: T,
  ): T {
    if (!Object.prototype.hasOwnProperty.call(entries, key)) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new ConfigMissingError(key);
    }

    return type.parse(key, entries[key]);
  }

  return {
    read,
    snapshot(): ReadonlyConfigSnapshot {
      return entries;
    },
  };
}
