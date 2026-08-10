import type { Module, PlatformStorage } from "../../../framework";
import type { AutoBattleLineup } from "../models";
import { MAX_TEAM_SIZE } from "./config";

/** lineup 存档 schema 版本：升级时递增，迁移器映射按版本注册。 */
export const LINEUP_SAVE_VERSION = 1;

/** 底层存储键：命名空间 + 存档键编码，供测试直接播种旧版本/损坏记录。 */
export const LINEUP_STORAGE_KEY = "auto-battle:auto_battle:lineup";

/** 迁移器：把某旧版本的 lineup 存档数据升级为下一版本数据。 */
export type LineupSaveMigrator = (data: unknown) => unknown;

/** lineup 存储选项：注入平台存储，可选指定当前版本与迁移器映射（测试/未来演进）。 */
export interface LineupStoreOptions {
    readonly storage: PlatformStorage;
    /** 当前 schema version；缺省为 LINEUP_SAVE_VERSION。 */
    readonly currentVersion?: number;
    /** 迁移映射：源版本 → 升级到源版本+1 的迁移器；缺省表示不支持任何旧版本。 */
    readonly migrators?: Readonly<Record<number, LineupSaveMigrator>>;
}

/** lineup 存储句柄：基于注入的平台存储，读写版本化编队存档。 */
export interface LineupStore {
    readonly currentVersion: number;
    /** 写入编队存档（记录当前版本）；payload 非法在写入前拒绝。 */
    save(lineup: AutoBattleLineup): Promise<void>;
    /** 读取编队存档：缺档返回 null；未来版本拒绝；旧版本按迁移链升级。 */
    load(): Promise<{ readonly version: number; readonly data: AutoBattleLineup } | null>;
    /** 删除编队存档：幂等。 */
    delete(): Promise<void>;
}

/**
 * 校验存档数据是合法 lineup：对象、slots 为定长（0..MAX_TEAM_SIZE-1）数组且
 * 元素均为 heroId 字符串或 null。形状不符视为数据损坏，读取时抛错而非静默降级。
 */
function isLineupRecord(value: unknown): value is AutoBattleLineup {
    if (value === null || typeof value !== "object") {
        return false;
    }
    const slots = (value as { slots?: unknown }).slots;
    if (!Array.isArray(slots) || slots.length !== MAX_TEAM_SIZE) {
        return false;
    }
    return slots.every((slot) => slot === null || typeof slot === "string");
}

function corrupt(reason: string): Error {
    return new Error(`lineup store: corrupted record (${reason})`);
}

/**
 * 创建 lineup 存储：自持版本化实现（对齐 game_idle `createIdleSave` 先例——
 * `createVersionedStorage` 不在 framework 公开 API 白名单）。写入 `{ version,
 * data }` 记录；读取时按记录版本逐级迁移到当前版本，损坏/未来版本/缺失迁移
 * 均抛错（不静默降级为空编队），schema 版本化保证未来 09 挂机消费兼容。
 */
export function createLineupStore(options: LineupStoreOptions): LineupStore {
    const { storage } = options;
    const currentVersion = options.currentVersion ?? LINEUP_SAVE_VERSION;
    const migrators = options.migrators ?? {};

    function migrate(data: unknown, fromVersion: number): unknown {
        let migrated = data;
        let source = fromVersion;
        while (source < currentVersion) {
            const migrator = migrators[source];
            if (migrator === undefined) {
                throw new Error(
                    `lineup store: missing migration from version ${source}`,
                );
            }
            migrated = migrator(migrated);
            source += 1;
        }
        return migrated;
    }

    return {
        currentVersion,
        async save(lineup: AutoBattleLineup): Promise<void> {
            if (!isLineupRecord(lineup)) {
                throw corrupt("invalid lineup payload");
            }
            const record = JSON.stringify({ version: currentVersion, data: lineup });
            await storage.set(LINEUP_STORAGE_KEY, record);
        },
        async load() {
            const raw = await storage.get(LINEUP_STORAGE_KEY);
            if (raw === null) {
                return null;
            }

            let parsed: unknown;
            try {
                parsed = JSON.parse(raw);
            } catch {
                throw corrupt("invalid JSON");
            }
            if (parsed === null || typeof parsed !== "object") {
                throw corrupt("unexpected record shape");
            }

            const version = (parsed as { version?: unknown }).version;
            if (
                typeof version !== "number" ||
                !Number.isInteger(version) ||
                version <= 0
            ) {
                throw corrupt("unexpected record shape");
            }
            if (version > currentVersion) {
                throw new Error(
                    `lineup store: save version ${version} is newer than supported version ${currentVersion}`,
                );
            }

            const data =
                version === currentVersion
                    ? (parsed as { data?: unknown }).data
                    : migrate((parsed as { data?: unknown }).data, version);

            if (!isLineupRecord(data)) {
                throw corrupt("unexpected lineup shape");
            }

            return { version: currentVersion, data };
        },
        async delete(): Promise<void> {
            await storage.delete(LINEUP_STORAGE_KEY);
        },
    };
}

/**
 * lineup 存储模块：组合根创建存储并注入；模块只登记引用，平台存储由注入方
 * 持有，模块生命周期无副作用，不在此释放共享存储。
 */
export function createLineupStoreModule(store: LineupStore): Module {
    return {
        id: "auto_battle.lineup_store",
        dependencies: [],
        start: () => {
            // 存储句柄在组合根构造时即就绪；start 只是让模块进入装配清单
            void store.currentVersion;
        },
        dispose: () => {
            // 平台存储由注入方持有，此处不释放
        },
    };
}
