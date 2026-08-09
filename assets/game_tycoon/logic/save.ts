import type { Module, PlatformStorage } from "../../framework";
import type { TycoonEconomicState } from "../models";

/** 存档 schema 版本：夹具层自持版本号，升级时递增。 */
export const TYCOON_SAVE_VERSION = 1;

/** 版本化存档句柄：基于注入的平台存储，写入带版本号的存档记录。 */
export interface TycoonSave {
    readonly currentVersion: number;
    save(namespace: string, key: string, data: unknown): Promise<void>;
    load(
        namespace: string,
        key: string,
    ): Promise<{ version: number; data: unknown } | null>;
}

/**
 * 版本化存档：把 (namespace, key) 编码为平台存储键，写入 `{ version, data }`
 * 记录。读取时校验版本与数据完整性：损坏 JSON 或版本与当前版本不符的记录
 * 视为无效并返回 null（夹具层无迁移接缝，旧版本直接拒绝）。夹具层实现
 * "版本化"语义，不依赖框架根入口白名单外的内部实现（design decision 4 边界）。
 */
export function createTycoonSave(storage: PlatformStorage): TycoonSave {
    const keyFor = (namespace: string, key: string): string =>
        `tycoon:${encodeURIComponent(namespace)}:${encodeURIComponent(key)}`;

    return {
        currentVersion: TYCOON_SAVE_VERSION,
        async save(namespace: string, key: string, data: unknown): Promise<void> {
            const record = JSON.stringify({
                version: TYCOON_SAVE_VERSION,
                data,
            });
            await storage.set(keyFor(namespace, key), record);
        },
        async load(
            namespace: string,
            key: string,
        ): Promise<{ version: number; data: unknown } | null> {
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
            if (
                typeof record.version !== "number" ||
                record.version !== TYCOON_SAVE_VERSION
            ) {
                return null;
            }

            // data 形状不符视为无效：避免调用方拿到畸形记录后按经济状态使用
            if (!isTycoonEconomicState(record.data)) {
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
export function createTycoonSaveModule(save: TycoonSave): Module {
    return {
        id: "tycoon.save",
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

/** 存档记录的读写守卫：经济状态结算后写入的固定形状。 */
export function isTycoonEconomicState(value: unknown): value is TycoonEconomicState {
    if (value === null || typeof value !== "object") {
        return false;
    }

    const record = value as Record<string, unknown>;

    if (typeof record.cash !== "number" || !Number.isFinite(record.cash)) {
        return false;
    }

    if (record.inventory === null || typeof record.inventory !== "object") {
        return false;
    }

    // 逐个校验库存计数（ES2015 兼容，不用 Object.values）
    for (const productId of Object.keys(
        record.inventory as Record<string, unknown>,
    )) {
        const count = (record.inventory as Record<string, unknown>)[productId];
        if (typeof count !== "number" || !Number.isFinite(count) || count < 0) {
            return false;
        }
    }

    return true;
}
