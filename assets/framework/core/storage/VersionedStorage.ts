import { FrameworkError } from "../errors/FrameworkError";
import type { ISaveLoadResult } from "../../contracts/interfaces/ISaveLoadResult";
import type { ISaveMigrator } from "../../contracts/interfaces/ISaveMigrator";
import type { ISaveVersion } from "../../contracts/interfaces/ISaveVersion";
import type { IVersionedStorage } from "../../contracts/interfaces/IVersionedStorage";
import type { IVersionedStorageOptions } from "../../contracts/interfaces/IVersionedStorageOptions";

// branded number 内部运算统一转 number，边界处收窄回 ISaveVersion（branded 无运行期值）
function toNumber(version: ISaveVersion): number {
    return Number(version);
}

function toVersion(version: number): ISaveVersion {
    return version as unknown as ISaveVersion;
}

/** 命名空间前缀与存档键的分隔符；键空间依赖它实现命名空间隔离。 */
const NAMESPACE_SEPARATOR = ":";

/** 存档封装记录的键前缀；区分存档记录与未来可能扩展的其他条目。 */
const RECORD_PREFIX = "save:";

/** 存档版本高于当前支持版本时的类型化错误，携带记录版本与当前版本。 */
export class SaveVersionError extends FrameworkError {
    readonly recordVersion: ISaveVersion;
    readonly currentVersion: ISaveVersion;

    constructor(recordVersion: ISaveVersion, currentVersion: ISaveVersion) {
        super(`Save version ${recordVersion} is newer than supported version ${currentVersion}`, { component: "versioned-storage" });

        this.name = "SaveVersionError";
        this.recordVersion = recordVersion;
        this.currentVersion = currentVersion;
    }
}

/** 存档版本迁移失败（缺失迁移级或迁移器抛错）时的类型化错误，携带缺口版本与原因。 */
export class SaveMigrationError extends FrameworkError {
    readonly fromVersion: ISaveVersion;
    readonly toVersion: ISaveVersion;

    constructor(fromVersion: ISaveVersion, toVersion: ISaveVersion, options?: { readonly cause?: unknown }) {
        super(`Missing or failed save migration from version ${fromVersion} to ${toVersion}`, { component: "versioned-storage", cause: options?.cause });

        this.name = "SaveMigrationError";
        this.fromVersion = fromVersion;
        this.toVersion = toVersion;
    }
}

/** 存档 DTO 不可序列化时的类型化错误；发生在写入前，不产生部分写入。 */
export class SaveSerializationError extends FrameworkError {
    constructor(detail: string) {
        super(`Save data is not serializable: ${detail}`, {
            component: "versioned-storage",
        });

        this.name = "SaveSerializationError";
    }
}

/** 底层存档记录损坏（JSON 非法或形状不符）时的类型化错误，携带损坏描述。 */
export class SaveCorruptionError extends FrameworkError {
    constructor(detail: string) {
        super(`Save record is corrupted: ${detail}`, {
            component: "versioned-storage",
        });

        this.name = "SaveCorruptionError";
    }
}

// 递归校验 DTO 是否可 JSON 序列化。检测 undefined、函数、symbol、
// BigInt 与循环引用；返回首个问题描述，null 表示可序列化。
// 用访问中的 WeakSet 追踪祖先路径检测循环引用，避免只记录根路径。
function findSerializationIssue(value: unknown, ancestors: WeakSet<object>): string | null {
    if (value === null || typeof value === "string" || typeof value === "boolean") {
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

// 组装底层存储键：RECORD_PREFIX + 编码命名空间 + 分隔符 + 编码存档键。
// 对命名空间与键做 URI 编码，避免其中的分隔符或其他保留字符造成键空间冲突，
// 保证不同 (namespace, key) 组合映射到不同存储键、互不覆盖。
function composeStorageKey(namespace: string, key: string): string {
    return `${RECORD_PREFIX}${encodeURIComponent(namespace)}${NAMESPACE_SEPARATOR}${encodeURIComponent(key)}`;
}

// 校验解析出的存档记录形状：必须是包含正整数 version 与 data 字段的对象。
// 形状不符视为数据损坏，抛出类型化错误而非静默降级为空存档。
function parseRecord(raw: string): { version: number; data: unknown } {
    let parsed: unknown;

    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new SaveCorruptionError("invalid JSON");
    }

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) || !("version" in parsed) || !("data" in parsed)) {
        throw new SaveCorruptionError("unexpected record shape");
    }

    const version = (parsed as { version: unknown }).version;

    if (typeof version !== "number" || !Number.isInteger(version) || version <= 0) {
        throw new SaveCorruptionError("unexpected record shape");
    }

    return { version, data: (parsed as { data: unknown }).data };
}

export function createVersionedStorage(options: IVersionedStorageOptions): IVersionedStorage {
    const { storage } = options;
    // 当前版本在构造时转 number：内部比较/迁移按原始数值，契约边界再收窄回品牌类型
    const currentVersion = toNumber(options.currentVersion);
    // 迁移映射缺省为空：不注册任何迁移则任何旧版本存档都无法读取。
    // Record 键必须是原始 number（branded 类型无法作索引键，语义等价）。
    const migrators: Readonly<Record<number, ISaveMigrator>> = options.migrators ?? {};

    // 按记录版本逐级升级到当前版本；缺失迁移或迁移抛错时抛类型化错误。
    function migrate(data: unknown, fromVersion: number): unknown {
        let migrated = data;
        let sourceVersion = fromVersion;

        while (sourceVersion < currentVersion) {
            const migrator = migrators[sourceVersion];

            if (migrator === undefined) {
                throw new SaveMigrationError(toVersion(sourceVersion), toVersion(sourceVersion + 1));
            }

            try {
                migrated = migrator(migrated);
            } catch (error) {
                // 迁移失败整体失败，不落盘部分结果；底层错误经 cause 保留可诊断。
                throw new SaveMigrationError(toVersion(sourceVersion), toVersion(sourceVersion + 1), {
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

        async load(namespace, key): Promise<ISaveLoadResult | null> {
            const raw = await storage.get(composeStorageKey(namespace, key));

            if (raw === null) {
                return null;
            }

            // 底层存储损坏时 JSON 解析失败或形状不符：视为数据损坏而非未来版本/迁移问题。
            const record = parseRecord(raw);

            if (record.version > currentVersion) {
                throw new SaveVersionError(toVersion(record.version), toVersion(currentVersion));
            }

            if (record.version === currentVersion) {
                return { version: toVersion(record.version), data: record.data };
            }

            return { version: toVersion(currentVersion), data: migrate(record.data, record.version) };
        },

        async delete(namespace, key) {
            await storage.delete(composeStorageKey(namespace, key));
        },
    };
}
