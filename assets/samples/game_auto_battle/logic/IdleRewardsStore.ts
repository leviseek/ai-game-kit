import { createVersionedStorage, type ISaveMigrator, type ISaveVersion, type IModule, type IPlatformStorage } from "../../../framework";
import type { IdleRewardState } from "../models";

/** 挂机存档 schema 版本：夹具层自持版本号，升级时递增。 */
export const IDLE_REWARDS_SAVE_VERSION = 1;

/** 底层存储键：前缀 + 命名空间/存档键编码（对齐 LINEUP_STORAGE_KEY 先例）。 */
export const IDLE_REWARDS_STORAGE_KEY = `auto-battle:${encodeURIComponent("auto_battle")}:${encodeURIComponent("idle-rewards")}`;

/** 迁移器：把某旧版本的挂机存档数据升级为下一版本数据。 */
export type IdleRewardsSaveMigrator = (data: unknown) => unknown;

/** 挂机存储选项：注入平台存储，可选指定当前版本与迁移器映射（测试/未来演进）。 */
export interface IdleRewardsStoreOptions {
    readonly storage: IPlatformStorage;
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
 * 创建挂机存储：版本化实现委托框架 `createVersionedStorage`（P2-9）——固定
 * `storageKey` 保留既有存储键不换键（旧存档原位可读），版本/迁移/损坏判定复用
 * 框架原语；本层保留挂机状态形状校验（isIdleRewardRecord）与 payload 前置拒绝。
 */
export function createIdleRewardsStore(options: IdleRewardsStoreOptions): IdleRewardStore {
    const { storage } = options;
    const currentVersion = options.currentVersion ?? IDLE_REWARDS_SAVE_VERSION;
    // 迁移映射：调用方按版本注册（v1 为当前版本，未来演进时递增并注册迁移器）
    const migrators = options.migrators ?? {};
    const versioned = createVersionedStorage({
        storage,
        currentVersion: currentVersion as unknown as ISaveVersion,
        migrators: migrators as Readonly<Record<number, ISaveMigrator>>,
        storageKey: IDLE_REWARDS_STORAGE_KEY,
    });

    return {
        currentVersion,
        async save(state: IdleRewardState): Promise<void> {
            if (!isIdleRewardRecord(state)) {
                throw corrupt("invalid idle rewards payload");
            }
            await versioned.save("auto-battle", "idle-rewards", state);
        },
        async load() {
            const loaded = await versioned.load("auto-battle", "idle-rewards");
            if (loaded === null) {
                return null;
            }
            if (!isIdleRewardRecord(loaded.data)) {
                throw corrupt("unexpected idle rewards shape");
            }
            return { version: currentVersion, data: loaded.data };
        },
        async delete(): Promise<void> {
            await versioned.delete("auto-battle", "idle-rewards");
        },
    };
}

/**
 * 挂机存储模块：组合根创建存储并注入；模块只登记引用，平台存储由注入方
 * 持有，模块生命周期无副作用，不在此释放共享存储。
 */
export function createIdleRewardsStoreModule(store: IdleRewardStore): IModule {
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
