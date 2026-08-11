import type { Module, PlatformStorage } from "../../../framework";
import type { IdleRewardState } from "../models";

/** 挂机存档 schema 版本：夹具层自持版本号，升级时递增。 */
export const IDLE_REWARDS_SAVE_VERSION = 1;

/** 底层存储键：前缀 + 命名空间/存档键编码（对齐 LINEUP_STORAGE_KEY 先例）。 */
export const IDLE_REWARDS_STORAGE_KEY =
    `auto-battle:${encodeURIComponent("auto_battle")}:${encodeURIComponent("idle-rewards")}`;

/** 迁移器：把某旧版本的挂机存档数据升级为下一版本数据。 */
export type IdleRewardsSaveMigrator = (data: unknown) => unknown;

/** 挂机存储选项：注入平台存储，可选指定当前版本与迁移器映射（测试/未来演进）。 */
export interface IdleRewardsStoreOptions {
    readonly storage: PlatformStorage;
    /** 当前 schema version；缺省为 IDLE_REWARDS_SAVE_VERSION。 */
    readonly currentVersion?: number;
    /** 迁移映射：源版本 → 升级到源版本+1 的迁移器；缺省为空，可覆盖。 */
    readonly migrators?: Readonly<Record<number, IdleRewardsSaveMigrator>>;
}

/** 挂机存储句柄：基于注入的平台存储，读写版本化挂机存档（服务器替换点预留）。 */
export interface IdleRewardStore {
    readonly currentVersion: number;
    /** 写入挂机存档（记录当前版本）；payload 非法在写入前拒绝。 */
    save(state: IdleRewardState): Promise<void>;
    /** 读取挂机存档：缺档返回 null；未来版本拒绝；旧版本按迁移链升级。 */
    load(): Promise<{ readonly version: number; readonly data: IdleRewardState } | null>;
    /** 删除挂机存档：幂等。 */
    delete(): Promise<void>;
}

/**
 * 校验存档数据是合法挂机状态：对象、三个字段均为有限非负数值。
 * 形状不符视为数据损坏，读取时抛错而非静默降级。
 */
export function isIdleRewardRecord(value: unknown): value is IdleRewardState {
    if (value === null || typeof value !== "object") {
        return false;
    }
    const record = value as Record<string, unknown>;
    return (
        typeof record.lastSeenAtMs === "number" &&
        Number.isFinite(record.lastSeenAtMs) &&
        record.lastSeenAtMs >= 0 &&
        typeof record.totalRewards === "number" &&
        Number.isFinite(record.totalRewards) &&
        record.totalRewards >= 0 &&
        typeof record.earnedAtMs === "number" &&
        Number.isFinite(record.earnedAtMs) &&
        record.earnedAtMs >= 0
    );
}

function corrupt(reason: string): Error {
    return new Error(`idle rewards store: corrupted record (${reason})`);
}

/**
 * 创建挂机存储：自持版本化实现（对齐 lineup-store `createLineupStore` 先例——
 * `createVersionedStorage` 不在 framework 公开 API 白名单）。写入 `{ version,
 * data }` 记录；读取时按记录版本逐级迁移到当前版本，损坏/未来版本/缺失迁移
 * 均抛错（不静默降级为空状态），schema 版本化保证未来字段演进可迁移。
 */
export function createIdleRewardsStore(
    options: IdleRewardsStoreOptions,
): IdleRewardStore {
    const { storage } = options;
    const currentVersion = options.currentVersion ?? IDLE_REWARDS_SAVE_VERSION;
    // 迁移映射：调用方按版本注册（v1 为当前版本，未来演进时递增并注册迁移器）
    const migrators = options.migrators ?? {};

    function migrate(data: unknown, fromVersion: number): unknown {
        let migrated = data;
        let source = fromVersion;
        while (source < currentVersion) {
            const migrator = migrators[source];
            if (migrator === undefined) {
                throw new Error(
                    `idle rewards store: missing migration from version ${source}`,
                );
            }
            migrated = migrator(migrated);
            source += 1;
        }
        return migrated;
    }

    return {
        currentVersion,
        async save(state: IdleRewardState): Promise<void> {
            if (!isIdleRewardRecord(state)) {
                throw corrupt("invalid idle rewards payload");
            }
            const record = JSON.stringify({ version: currentVersion, data: state });
            await storage.set(IDLE_REWARDS_STORAGE_KEY, record);
        },
        async load() {
            const raw = await storage.get(IDLE_REWARDS_STORAGE_KEY);
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
                    `idle rewards store: save version ${version} is newer than supported version ${currentVersion}`,
                );
            }

            const data =
                version === currentVersion
                    ? (parsed as { data?: unknown }).data
                    : migrate((parsed as { data?: unknown }).data, version);

            if (!isIdleRewardRecord(data)) {
                throw corrupt("unexpected idle rewards shape");
            }

            return { version: currentVersion, data };
        },
        async delete(): Promise<void> {
            await storage.delete(IDLE_REWARDS_STORAGE_KEY);
        },
    };
}

/**
 * 挂机存储模块：组合根创建存储并注入；模块只登记引用，平台存储由注入方
 * 持有，模块生命周期无副作用，不在此释放共享存储。
 */
export function createIdleRewardsStoreModule(store: IdleRewardStore): Module {
    return {
        id: "auto_battle.idle_rewards_store",
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
