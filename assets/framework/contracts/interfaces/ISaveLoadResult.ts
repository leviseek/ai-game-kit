import type { ISaveVersion } from "./ISaveVersion";

/** 读取到的存档：记录中的版本与迁移后的数据。 */
export interface ISaveLoadResult {
    readonly version: ISaveVersion;
    readonly data: unknown;
}
