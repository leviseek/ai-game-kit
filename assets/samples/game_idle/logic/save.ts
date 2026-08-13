import type { Module, PlatformStorage } from "../../../framework";
import type { IdleSaveRecord } from "../models";

/** 存档 schema 版本：夹具层自持版本号，升级时递增。 */
export const IDLE_SAVE_VERSION = 1;

/** 版本化存档句柄：基于注入的平台存储，写入带版本号的存档记录。 */
export interface IdleSave {
    readonly currentVersion: number;
    save(namespace: string, key: string, data: unknown): Promise<void>;
    load(namespace: string, key: string): Promise<{ version: number; data: unknown } | null>;
}

/**
 * 版本化存档：把 (namespace, key) 编码为平台存储键，写入 `{ version, data }`
 * 记录。读取时校验版本与数据完整性：损坏 JSON 或版本与当前版本不符的记录
 * 视为无效并返回 null（夹具层无迁移接缝，旧版本直接拒绝）。夹具层实现
 * "版本化"语义，不依赖框架根入口白名单外的内部实现（design decision 4 边界）。
 */
export function createIdleSave(storage: PlatformStorage): IdleSave {
    const keyFor = (namespace: string, key: string): string => `idle:${encodeURIComponent(namespace)}:${encodeURIComponent(key)}`;

    return {
        currentVersion: IDLE_SAVE_VERSION,
        async save(namespace: string, key: string, data: unknown): Promise<void> {
            const record = JSON.stringify({
                version: IDLE_SAVE_VERSION,
                data,
            });
            await storage.set(keyFor(namespace, key), record);
        },
        async load(namespace: string, key: string): Promise<{ version: number; data: unknown } | null> {
            const raw = await storage.get(keyFor(namespace, key));
            if (raw === null) {
                return null;
            }

            let record: { version?: unknown; data?: unknown };
            try {
                record = JSON.parse(raw) as { version?: unknown; data?: unknown };
            } catch {
                // 损坏 JSON 视为无效记录，返回 null（对齐 PlatformStorage 缺档语义）
                return null;
            }

            // 版本缺失或与当前版本不符的记录视为无效：夹具层不承载迁移
            if (typeof record.version !== "number" || record.version !== IDLE_SAVE_VERSION) {
                return null;
            }

            return { version: record.version, data: record.data };
        },
    };
}

/**
 * 存档模块：组合根创建存档仓库并注入；模块只登记引用，平台存储由注入方
 * 持有，模块生命周期无副作用，不在此释放共享存档仓库。
 */
export function createIdleSaveModule(save: IdleSave): Module {
    return {
        id: "idle.save",
        dependencies: [],
        start: () => {
            // 存档仓库已就绪；版本号经 currentVersion 暴露
            void save.currentVersion;
        },
        dispose: () => {
            // 平台存储由注入方持有，此处不释放
        },
    };
}

/** 存档记录的读写守卫：离线收益结算后写入的固定形状。 */
export function isIdleSaveRecord(value: unknown): value is IdleSaveRecord {
    if (value === null || typeof value !== "object") {
        return false;
    }

    const record = value as Record<string, unknown>;

    return typeof record.level === "number" && Number.isFinite(record.level) && typeof record.gold === "number" && Number.isFinite(record.gold);
}
