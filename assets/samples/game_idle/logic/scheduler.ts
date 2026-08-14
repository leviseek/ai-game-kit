import { PassiveScheduler, type IModule } from "../../../framework";
import type { IdleClock } from "./clock";

export interface IdleScheduleOptions {
    readonly repeat?: boolean;
}

/** 调度任务取消句柄：同步幂等取消，幂等释放。 */
export interface IdleScheduleHandle {
    dispose(): void;
}

/**
 * 被动任务调度器：没有内部定时器，必须由调用方外部驱动 tick()（墙钟注入）。
 * 在线收益任务经 schedule 注册，tick 结算到期任务；任务取消置 cancelled 标记
 * 并延迟到下次 tick 移除。单个任务回调异常隔离到 onTaskError，不中断
 * 同一批其他到期任务。实现复用框架 PassiveScheduler（框架根入口已导出），
 * 品类层不再自实现最小调度器。
 */
export interface IdleScheduler {
    schedule(callback: () => void, delayMilliseconds: number, options?: IdleScheduleOptions): IdleScheduleHandle;
    tick(): void;
    dispose(): void;
}

export function createIdleScheduler(clock: IdleClock): IdleScheduler {
    return new PassiveScheduler(clock);
}

/**
 * 调度模块：组合根创建调度器并注入；模块只登记引用，不在 dispose 释放共享
 * 调度器——组合根的 dispose 统一负责（对齐 GameFixture 幂等契约）。
 */
export function createIdleSchedulerModule(scheduler: IdleScheduler): IModule {
    return {
        id: "idle.scheduler",
        dependencies: [],
        start: () => {
            // 调度器在组合根构造时即就绪；start 只是让模块进入装配清单
            void scheduler.tick;
        },
    };
}
