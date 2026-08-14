import type { IModule } from "../../../framework";
import type { IdleClock } from "./clock";

export interface IdleScheduleOptions {
    readonly repeat?: boolean;
}

/** 调度任务取消句柄：同步幂等取消，幂等释放。 */
export interface IdleScheduleHandle {
    dispose(): void;
}

interface ScheduledTask {
    readonly callback: () => void;
    readonly interval: number;
    readonly repeat: boolean;
    dueAt: number;
    cancelled: boolean;
}

/**
 * 被动任务调度器：没有内部定时器，必须由调用方外部驱动 tick()（墙钟注入）。
 * 在线收益任务经 schedule 注册，tick 结算到期任务；任务取消置 cancelled 标记
 * 并延迟到下次 tick 移除。单个任务回调异常隔离到 console.error，不中断
 * 同一批其他到期任务（对齐框架 PassiveScheduler 的 onTaskError 语义）。
 * 框架根入口不导出 PassiveScheduler（public-boundary 白名单），
 * 故夹具层自实现最小调度器，驱动在线收益的确定性推进。
 */
export interface IdleScheduler {
    schedule(callback: () => void, delayMilliseconds: number, options?: IdleScheduleOptions): IdleScheduleHandle;
    tick(): void;
    dispose(): void;
}

export function createIdleScheduler(clock: IdleClock): IdleScheduler {
    let tasks: ScheduledTask[] = [];
    let disposed = false;

    return {
        schedule(callback: () => void, delayMilliseconds: number, options: IdleScheduleOptions = {}): IdleScheduleHandle {
            if (disposed) {
                throw new Error("IdleScheduler cannot schedule after disposal");
            }

            if (!Number.isFinite(delayMilliseconds) || delayMilliseconds < 0) {
                throw new Error("IdleScheduler delay must be finite and non-negative");
            }

            const task: ScheduledTask = {
                callback,
                interval: delayMilliseconds,
                repeat: options.repeat === true,
                dueAt: clock.now() + delayMilliseconds,
                cancelled: false,
            };

            tasks.push(task);

            return {
                dispose: () => {
                    task.cancelled = true;
                },
            };
        },

        tick(): void {
            if (disposed) {
                return;
            }

            const now = clock.now();
            const dueTasks: ScheduledTask[] = [];
            const pendingTasks: ScheduledTask[] = [];

            for (const task of tasks) {
                if (task.cancelled) {
                    continue;
                }

                if (task.dueAt <= now) {
                    dueTasks.push(task);
                } else {
                    pendingTasks.push(task);
                }
            }

            tasks = pendingTasks;

            dueTasks.sort((a, b) => a.dueAt - b.dueAt);

            for (const task of dueTasks) {
                if (disposed) {
                    break;
                }

                if (task.cancelled) {
                    continue;
                }

                // 单任务异常隔离：回调抛错不中断同批其他到期任务
                try {
                    task.callback();
                } catch (error) {
                    console.error(error);
                }

                if (task.repeat) {
                    // 用当前 now 重排，避免长任务造成的到期时间漂移累积
                    task.dueAt = now + task.interval;
                    tasks.push(task);
                }
            }
        },

        dispose(): void {
            disposed = true;
            tasks.length = 0;
        },
    };
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
