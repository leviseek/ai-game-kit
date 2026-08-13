import type { TimeSource } from "../../contracts/time/TimeSource";
import type { DisposeHandle } from "./DisposeHandle";

export interface ScheduleOptions {
    readonly repeat?: boolean;
}

export interface PassiveSchedulerOptions {
    readonly onTaskError?: (error: unknown) => void;
}

interface ScheduledTask {
    readonly callback: () => void;
    readonly interval: number;
    readonly repeat: boolean;
    dueAt: number;
    cancelled: boolean;
}

/**
 * 被动任务调度器：没有内部定时器，必须由调用方外部驱动 tick()（时间源注入）。
 * 任务取消只置 cancelled 标记并延迟到下次 tick 移除（与事件通道同一模式）；
 * 任务回调异常隔离到 onTaskError，不中断同一批其他到期任务。
 */
export class PassiveScheduler {
    private readonly timeSource: TimeSource;
    private readonly onTaskError: (error: unknown) => void;
    private tasks: ScheduledTask[] = [];
    private disposed = false;

    constructor(timeSource: TimeSource, options: PassiveSchedulerOptions = {}) {
        this.timeSource = timeSource;
        this.onTaskError = options.onTaskError ?? ((error) => console.error(error));
    }

    schedule(callback: () => void, delayMilliseconds: number, options: ScheduleOptions = {}): DisposeHandle {
        if (this.disposed) {
            throw new Error("PassiveScheduler cannot schedule after disposal");
        }

        if (!Number.isFinite(delayMilliseconds) || delayMilliseconds < 0) {
            throw new Error("PassiveScheduler delay must be finite and non-negative");
        }

        const task: ScheduledTask = {
            callback,
            interval: delayMilliseconds,
            repeat: options.repeat === true,
            dueAt: this.timeSource.now() + delayMilliseconds,
            cancelled: false,
        };

        this.tasks.push(task);

        return {
            dispose: () => {
                task.cancelled = true;
            },
        };
    }

    tick(): void {
        if (this.disposed) {
            return;
        }

        const now = this.timeSource.now();
        const dueTasks: ScheduledTask[] = [];
        const pendingTasks: ScheduledTask[] = [];

        for (const task of this.tasks) {
            if (task.cancelled) {
                continue;
            }

            if (task.dueAt <= now) {
                dueTasks.push(task);
            } else {
                pendingTasks.push(task);
            }
        }

        this.tasks = pendingTasks;

        // 按到期时间排序执行，保证同一 tick 内按到期先后处理。
        dueTasks.sort((a, b) => a.dueAt - b.dueAt);

        for (const task of dueTasks) {
            if (this.disposed) {
                break;
            }

            if (task.cancelled) {
                continue;
            }

            try {
                task.callback();
            } catch (error) {
                this.onTaskError(error);
            }

            if (task.repeat) {
                // 用当前 now（而非 task.dueAt + interval）重排，避免长任务造成的到期时间漂移累积。
                task.dueAt = now + task.interval;
                this.tasks.push(task);
            }
        }
    }

    dispose(): void {
        this.disposed = true;
        this.tasks.length = 0;
    }
}
