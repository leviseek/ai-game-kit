import type { IPlatformStorage } from "./IPlatformStorage";
import type { ISaveVersion } from "./ISaveVersion";
import type { ISaveMigrator } from "./ISaveMigrator";

/** 引擎无关的版本化存档仓库配置：注入存储后端、当前版本与可选迁移映射。 */
export interface IVersionedStorageOptions {
    /** 底层异步键值存储；命名空间经键前缀隔离。 */
    readonly storage: IPlatformStorage;
    /** 当前支持的 schema version；新写入的存档记录该版本。 */
    readonly currentVersion: ISaveVersion;
    /** 迁移映射：源版本 → 升级到源版本+1 的迁移器；缺省表示不支持任何旧版本。 */
    readonly migrators?: Readonly<Record<number, ISaveMigrator>>;
}
