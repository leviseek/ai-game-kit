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
 * 抛错均为类型化错误：SaveVersionError / SaveMigrationError /
 * SaveSerializationError / SaveCorruptionError，定义于 core/storage。
 *
 * 命名空间与存档键允许任意字符串（含空串、保留字符 `:` 与 `%`）；
 * 存储键经 URI 编码保证不同 (namespace, key) 组合不冲突。
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
