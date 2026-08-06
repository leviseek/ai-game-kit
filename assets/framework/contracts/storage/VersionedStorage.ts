import { FrameworkError } from "../../core/errors/FrameworkError";
import type { PlatformStorage } from "../platform/Platform";

/** 存档 schema 版本：自增正整数。 */
export type SaveVersion = number;

/**
 * 迁移器：把某旧版本的存档数据升级为下一版本数据。
 * 迁移器只负责"该级"升级；框架按注册映射逐级调用，不感知具体数据形状。
 */
export type SaveMigrator = (data: unknown) => unknown;

/** 引擎无关的版本化存档仓库配置：注入存储后端、当前版本与可选迁移映射。 */
export interface VersionedStorageOptions {
  /** 底层异步键值存储；命名空间经键前缀隔离。 */
  readonly storage: PlatformStorage;
  /** 当前支持的 schema version；新写入的存档记录该版本。 */
  readonly currentVersion: SaveVersion;
  /** 迁移映射：源版本 → 升级到源版本+1 的迁移器；缺省表示不支持任何旧版本。 */
  readonly migrators?: Readonly<Record<SaveVersion, SaveMigrator>>;
}

/** 读取到的存档：记录中的版本与迁移后的数据。 */
export interface SaveLoadResult {
  readonly version: SaveVersion;
  readonly data: unknown;
}

/**
 * 版本化存档仓库：以命名空间隔离存档，记录 schema version，
 * 读取时对未来版本拒绝、对旧版本逐级迁移。不依赖 cc/fgui。
 */
export interface VersionedStorage {
  /** 校验数据可序列化后写入指定命名空间与键；不可序列化在写入前以类型化错误拒绝。 */
  save(namespace: string, key: string, data: unknown): Promise<void>;
  /**
   * 读取指定命名空间与键的存档。缺档返回 null；未来版本抛 SaveVersionError；
   * 旧版本按迁移链逐级升级，缺失迁移或迁移抛错抛 SaveMigrationError。
   */
  load(namespace: string, key: string): Promise<SaveLoadResult | null>;
  /** 删除指定命名空间与键的存档；幂等，删除不存在条目不影响其他命名空间。 */
  delete(namespace: string, key: string): Promise<void>;
}

/** 存档版本高于当前支持版本时的类型化错误，携带记录版本与当前版本。 */
export class SaveVersionError extends FrameworkError {
  readonly recordVersion: SaveVersion;
  readonly currentVersion: SaveVersion;

  constructor(recordVersion: SaveVersion, currentVersion: SaveVersion) {
    super(
      `Save version ${recordVersion} is newer than supported version ${currentVersion}`,
      { component: "versioned-storage" },
    );

    this.name = "SaveVersionError";
    this.recordVersion = recordVersion;
    this.currentVersion = currentVersion;
  }
}

/** 存档版本迁移失败（缺失迁移级或迁移器抛错）时的类型化错误，携带缺口版本与原因。 */
export class SaveMigrationError extends FrameworkError {
  readonly fromVersion: SaveVersion;
  readonly toVersion: SaveVersion;

  constructor(
    fromVersion: SaveVersion,
    toVersion: SaveVersion,
    options?: { readonly cause?: unknown },
  ) {
    super(
      `Missing or failed save migration from version ${fromVersion} to ${toVersion}`,
      { component: "versioned-storage", cause: options?.cause },
    );

    this.name = "SaveMigrationError";
    this.fromVersion = fromVersion;
    this.toVersion = toVersion;
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

/** 存档 DTO 不可序列化时的类型化错误；发生在写入前，不产生部分写入。 */
export class SaveSerializationError extends FrameworkError {
  constructor(detail: string) {
    super(`Save data is not serializable: ${detail}`, {
      component: "versioned-storage",
    });

    this.name = "SaveSerializationError";
  }
}
