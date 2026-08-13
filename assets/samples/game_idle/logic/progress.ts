import type { Module } from "../../../framework";
import type { IdleClock } from "./clock";
import type { IdleOfflineSettlement, IdleProgressState } from "../models";

/** 在线收益 tick 间隔：墙钟推进一个间隔后由调度器结算一次在线收益。 */
export const ONLINE_TICK_MS = 1000;

/**
 * 在线收益跳变阈值：墙钟推进超过该值视为离线/异常跳变，跳过在线收益。
 * 阈值放宽到正常间隔的 5 倍，避免帧对齐误差（advance 略超一个间隔）误杀
 * 在线收益；只有暂停恢复后或异常长推进这类"离线级"跳变才应被拦截。
 */
export const ONLINE_JUMP_MS = ONLINE_TICK_MS * 5;

/** 每次在线 tick 结算的金币数：固定节奏的在线收益，与等级无关。 */
const ONLINE_GOLD_PER_TICK = 1;

/**
 * 离线收益公式（游戏层）：按离线分钟数 × 等级结算金币。
 * 成长公式只存在于游戏层，框架层不实现离线收益（4.1 负向断言锁定）。
 * 挂机语义：离线时长越长、等级越高，恢复时结算的金币越多。
 */
export function offlineGoldFor(level: number, elapsedMs: number): number {
    const elapsedMinutes = Math.floor(elapsedMs / 60_000);
    return elapsedMinutes * level;
}

/**
 * 成长进度控制器：持有等级与金币，暴露在线收益结算、离线收益结算与
 * 升级接缝。在线收益由调度器 tick 驱动，离线收益经暂停→恢复衔接结算。
 * 公式与规则全部位于夹具层，组合根只负责把时钟与存档注入进来。
 */
export interface IdleProgressHandle {
    readonly state: IdleProgressState;
    readonly level: number;
    readonly gold: number;
    /** 升级接缝：等级提升放大离线收益。 */
    advanceLevel(): void;
    /** 在线收益结算：由调度器 tick 驱动，墙钟正常推进一个间隔才结算。 */
    applyOnlineTick(): void;
    /** 暂停接缝：记录离线起点墙钟时间。 */
    onPause(): void;
    /** 恢复接缝：按墙钟累计离线时长结算离线收益并返回结算结果。 */
    onResume(): IdleOfflineSettlement;
    /** 停止成长推进，幂等。 */
    dispose(): void;
}

export function createIdleProgress(clock: IdleClock): IdleProgressHandle {
    let level = 1;
    let gold = 0;
    let lastSettledAtMs = clock.now();
    // 在线收益锚点：只结算自上次结算以来正常推进一个间隔的收益，
    // 墙钟大幅跳变（超过一个间隔）视为离线/异常，不结算在线收益
    let lastOnlineTickAt = clock.now();
    let pausedAtMs: number | null = null;
    let disposed = false;

    return {
        get state(): IdleProgressState {
            return { level, gold, lastSettledAtMs };
        },
        get level(): number {
            return level;
        },
        get gold(): number {
            return gold;
        },
        advanceLevel(): void {
            if (disposed) {
                return;
            }
            level += 1;
        },
        applyOnlineTick(): void {
            if (disposed) {
                return;
            }

            const now = clock.now();
            const elapsed = now - lastOnlineTickAt;
            lastOnlineTickAt = now;

            // 墙钟大幅跳变（超过跳变阈值，如暂停恢复后、异常长推进）时跳过在线收益：
            // 在线收益只按调度器的正常节奏累积；正常抖动（略超一个间隔）不误杀
            if (elapsed > ONLINE_JUMP_MS) {
                return;
            }

            gold += ONLINE_GOLD_PER_TICK;
            lastSettledAtMs = now;
        },
        onPause(): void {
            if (disposed) {
                return;
            }
            // 幂等：重复 pause 不重置离线起点（Application.pause 对已暂停状态幂等 resolve，
            // 暂停中再次 pause 是合法输入，覆盖起点会让已累计的离线时长在恢复时丢失）
            pausedAtMs = pausedAtMs ?? clock.now();
        },
        onResume(): IdleOfflineSettlement {
            const now = clock.now();
            const elapsedMs = pausedAtMs === null ? 0 : now - pausedAtMs;
            pausedAtMs = null;
            const goldEarned = offlineGoldFor(level, elapsedMs);
            gold += goldEarned;
            lastSettledAtMs = now;
            return { elapsedMs, goldEarned };
        },
        dispose(): void {
            if (disposed) {
                return;
            }
            disposed = true;
        },
    };
}

/**
 * 成长模块：组合根创建控制器并注入；模块只登记引用，不在 dispose 释放共享
 * 控制器——组合根的 dispose 统一负责（对齐 GameFixture 幂等契约）。
 */
export function createIdleProgressModule(progress: IdleProgressHandle): Module {
    return {
        id: "idle.progress",
        dependencies: [],
        start: () => {
            // 控制器在组合根构造时即就绪；start 只是让模块进入装配清单
            void progress.state.level;
        },
    };
}
