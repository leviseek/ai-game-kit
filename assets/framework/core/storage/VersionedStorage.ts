import type {
  SaveLoadResult,
  SaveMigrator,
  SaveVersion,
  VersionedStorage,
  VersionedStorageOptions,
} from "../../contracts/storage/VersionedStorage";
import {
  SaveCorruptionError,
  SaveMigrationError,
  SaveSerializationError,
  SaveVersionError,
} from "../../contracts/storage/VersionedStorage";

/** 命名空间前缀与存档键的分隔符；键空间依赖它实现命名空间隔离。 */
const NAMESPACE_SEPARATOR = ":";

/** 存档封装记录的键前缀；区分存档记录与未来可能扩展的其他条目。 */
const RECORD_PREFIX = "save:";

// 递归校验 DTO 是否可 JSON 序列化。检测 undefined、函数、symbol、
// BigInt 与循环引用；返回首个问题描述，null 表示可序列化。
// 用访问中的 WeakSet 追踪祖先路径检测循环引用，避免只记录根路径。
function findSerializationIssue(
  value: unknown,
  ancestors: WeakSet<object>,
): string | null {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return null;
  }

  if (typeof value === "number") {
    // NaN/Infinity 经 JSON.stringify 会变成 null，语义失真，一并拒绝。
    return Number.isFinite(value) ? null : "non-finite number";
  }

  if (typeof value === "undefined") {
    return "undefined value";
  }

  if (typeof value === "function") {
    return "function value";
  }

  if (typeof value === "symbol") {
    return "symbol value";
  }

  if (typeof value === "bigint") {
    return "BigInt value";
  }

  if (ancestors.has(value)) {
    return "circular reference";
  }

  ancestors.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const issue = findSerializationIssue(item, ancestors);
      if (issue !== null) {
        return `array item is ${issue}`;
      }
    }
  } else {
    for (const key of Object.keys(value)) {
      const entry = (value as Record<string, unknown>)[key];
      const issue = findSerializationIssue(entry, ancestors);
      if (issue !== null) {
        return `property "${key}" has ${issue}`;
      }
    }
  }

  ancestors.delete(value);
  return null;
}

function assertSerializable(data: unknown): void {
  const issue = findSerializationIssue(data, new WeakSet<object>());
  if (issue !== null) {
    throw new SaveSerializationError(issue);
  }
}

// 组装底层存储键：RECORD_PREFIX + 命名空间 + 分隔符 + 存档键。
function composeStorageKey(namespace: string, key: string): string {
  return `${RECORD_PREFIX}${namespace}${NAMESPACE_SEPARATOR}${key}`;
}

// 校验解析出的存档记录形状：必须是包含正整数 version 与 data 字段的对象。
// 形状不符视为数据损坏，抛出类型化错误而非静默降级为空存档。
function parseRecord(raw: string): { version: SaveVersion; data: unknown } {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SaveCorruptionError("invalid JSON");
  }

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    !("version" in parsed) ||
    !("data" in parsed)
  ) {
    throw new SaveCorruptionError("unexpected record shape");
  }

  const version = (parsed as { version: unknown }).version;

  if (typeof version !== "number" || !Number.isInteger(version) || version <= 0) {
    throw new SaveCorruptionError("unexpected record shape");
  }

  return { version, data: (parsed as { data: unknown }).data };
}

export function createVersionedStorage(
  options: VersionedStorageOptions,
): VersionedStorage {
  const { storage, currentVersion } = options;
  // 迁移映射缺省为空：不注册任何迁移则任何旧版本存档都无法读取。
  const migrators: Readonly<Record<SaveVersion, SaveMigrator>> =
    options.migrators ?? {};

  // 按记录版本逐级升级到当前版本；缺失迁移或迁移抛错时抛类型化错误。
  function migrate(data: unknown, fromVersion: SaveVersion): unknown {
    let migrated = data;
    let sourceVersion = fromVersion;

    while (sourceVersion < currentVersion) {
      const migrator = migrators[sourceVersion];

      if (migrator === undefined) {
        throw new SaveMigrationError(sourceVersion, sourceVersion + 1);
      }

      try {
        migrated = migrator(migrated);
      } catch (error) {
        // 迁移失败整体失败，不落盘部分结果；底层错误经 cause 保留可诊断。
        throw new SaveMigrationError(sourceVersion, sourceVersion + 1, {
          cause: error,
        });
      }

      sourceVersion += 1;
    }

    return migrated;
  }

  return {
    async save(namespace, key, data) {
      assertSerializable(data);

      const record = JSON.stringify({ version: currentVersion, data });
      await storage.set(composeStorageKey(namespace, key), record);
    },

    async load(namespace, key): Promise<SaveLoadResult | null> {
      const raw = await storage.get(composeStorageKey(namespace, key));

      if (raw === null) {
        return null;
      }

      // 底层存储损坏时 JSON 解析失败或形状不符：视为数据损坏而非未来版本/迁移问题。
      const record = parseRecord(raw);

      if (record.version > currentVersion) {
        throw new SaveVersionError(record.version, currentVersion);
      }

      if (record.version === currentVersion) {
        return { version: record.version, data: record.data };
      }

      return { version: currentVersion, data: migrate(record.data, record.version) };
    },

    async delete(namespace, key) {
      await storage.delete(composeStorageKey(namespace, key));
    },
  };
}
