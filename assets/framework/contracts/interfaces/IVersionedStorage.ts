import type { ISaveLoadResult } from "./ISaveLoadResult";

/**
 * 版本化存档仓库：以命名空间隔离存档，记录 schema version，
 * 读取时对未来版本拒绝、对旧版本逐级迁移。不依赖 cc/fgui。
 * 抛错均为类型化错误：SaveVersionError / SaveMigrationError /
 * SaveSerializationError / SaveCorruptionError，定义于 core/storage。
 *
 * 命名空间与存档键允许任意字符串（含空串、保留字符 `:` 与 `%`）；
 * 存储键经 URI 编码保证不同 (namespace, key) 组合不冲突。
 */
export interface IVersionedStorage {
    /** 校验数据可序列化后写入指定命名空间与键；不可序列化在写入前以类型化错误拒绝。 */
    save(namespace: string, key: string, data: unknown): Promise<void>;
    /**
     * 读取指定命名空间与键的存档。缺档返回 null；未来版本抛 SaveVersionError；
     * 旧版本按迁移链逐级升级，缺失迁移或迁移抛错抛 SaveMigrationError。
     */
    load(namespace: string, key: string): Promise<ISaveLoadResult | null>;
    /** 删除指定命名空间与键的存档；幂等，删除不存在条目不影响其他命名空间。 */
    delete(namespace: string, key: string): Promise<void>;
}
