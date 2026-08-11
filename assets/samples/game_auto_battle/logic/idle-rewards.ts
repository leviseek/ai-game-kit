import type { Module, TimeSource } from "../../../framework";
import type { AutoBattleLineup } from "../models";
import type {
    IdleOfflineSettlement,
    IdleRewardState,
} from "../models";

/** 固定收益速率：每离线分钟入账的收益基数（首版常量，lineup 加权作为预留接缝）。 */
export const DEFAULT_IDLE_RATE = 2;

/**
 * 速率接缝：根据当前编队计算收益速率。首版返回固定常量 DEFAULT_IDLE_RATE；
 * lineup 非空槽加权作为预留扩展点（spec：编队读取失败回退默认速率）。
 */
export function computeRate(_lineup: AutoBattleLineup | null): number {
    return DEFAULT_IDLE_RATE;
}

/**
 * 离线收益纯函数：按离线分钟数 × 速率结算。离线时长向下取整到分钟（不足
 * 一分钟不计收益），同输入 MUST 产生同输出，不依赖任何全局状态或时钟。
 * lastSeenAt/now 为墙钟时间戳（毫秒），now < lastSeenAt（时钟倒退）按 0 处理。
 */
export function computeIdleRewards(
    lastSeenAt: number,
    now: number,
    rate: number,
): IdleOfflineSettlement {
    if (!Number.isFinite(lastSeenAt) || !Number.isFinite(now)) {
        throw new Error("computeIdleRewards: timestamps must be finite");
    }
    if (!Number.isFinite(rate) || rate < 0) {
        throw new Error("computeIdleRewards: rate must be finite and non-negative");
    }
    const elapsedMs = Math.max(0, now - lastSeenAt);
    const minutes = Math.floor(elapsedMs / 60_000);
    return { minutes, earned: minutes * rate };
}

/** 收益速率来源接缝：返回当前速率；调用方在读取编队失败时可回退固定速率。 */
export type IdleRateSource = () => number;

/**
 * 入账控制器：持有挂机状态与注入墙钟，暴露离线结算与状态快照。
 * 结算即推进 lastSeenAt 到当前墙钟（幂等：同一段离线时长只入账一次，
 * 重复结算的 earned 为 0）；持久化由组合根在结算后触发。
 */
export interface IdleRewardsHandle {
    readonly state: IdleRewardState;
    /** 按当前墙钟结算离线收益并推进 lastSeenAt；返回本次结算结果。 */
    settleOffline(): IdleOfflineSettlement;
    /** 按当前墙钟预计算可领收益（不推进 lastSeenAt，纯展示；与 settleOffline 用同一速率）。 */
    previewOffline(): IdleOfflineSettlement;
    /** 以持久化状态覆盖当前内存状态（重启恢复用）。 */
    restore(state: IdleRewardState): void;
    dispose(): void;
}

export interface IdleRewardsHandleOptions {
    readonly clock: TimeSource;
    readonly rateSource?: IdleRateSource;
}

export function createIdleRewardsHandle(
    options: IdleRewardsHandleOptions,
): IdleRewardsHandle {
    const { clock } = options;
    const rateSource = options.rateSource ?? (() => DEFAULT_IDLE_RATE);
    let lastSeenAtMs = clock.now();
    let totalRewards = 0;
    let earnedAtMs = lastSeenAtMs;
    let disposed = false;

    return {
        get state(): IdleRewardState {
            return { lastSeenAtMs, totalRewards, earnedAtMs };
        },
        settleOffline(): IdleOfflineSettlement {
            if (disposed) {
                return { minutes: 0, earned: 0 };
            }
            const now = clock.now();
            const settlement = computeIdleRewards(
                lastSeenAtMs,
                now,
                rateSource(),
            );
            // 结算即推进 lastSeenAt：同一段离线时长不重复累计（幂等）
            lastSeenAtMs = now;
            totalRewards += settlement.earned;
            earnedAtMs = now;
            return settlement;
        },
        previewOffline(): IdleOfflineSettlement {
            if (disposed) {
                return { minutes: 0, earned: 0 };
            }
            return computeIdleRewards(lastSeenAtMs, clock.now(), rateSource());
        },
        restore(state: IdleRewardState): void {
            if (disposed) {
                return;
            }
            lastSeenAtMs = state.lastSeenAtMs;
            totalRewards = state.totalRewards;
            earnedAtMs = state.earnedAtMs;
        },
        dispose(): void {
            disposed = true;
        },
    };
}

/**
 * 挂机收益模块：组合根创建控制器并注入；模块只登记引用，不在 dispose 释放
 * 共享控制器——组合根的 dispose 统一负责（对齐 GameFixture 幂等契约）。
 */
export function createAutoBattleIdleRewardsModule(
    idleRewards: IdleRewardsHandle,
): Module {
    return {
        id: "auto_battle.idle_rewards",
        dependencies: [],
        start: () => {
            // 控制器在组合根构造时即就绪；start 只是让模块进入装配清单
            void idleRewards.state.totalRewards;
        },
        dispose: () => {
            // 控制器由组合根统一释放，此处不处置
        },
    };
}
