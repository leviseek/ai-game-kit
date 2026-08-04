import type { TimeSource } from "../../contracts/time/TimeSource";
import type { DisposeHandle } from "./DisposeHandle";

export interface PassiveSchedulerOptions {
  readonly repeat?: boolean;
}

export interface PassiveSchedulerConfig {
  readonly onTaskError?: (error: unknown) => void;
}

interface ScheduledTask {
  readonly callback: () => void;
  readonly interval: number;
  readonly repeat: boolean;
  dueAt: number;
  cancelled: boolean;
}

export class PassiveScheduler {
  private readonly timeSource: TimeSource;
  private readonly onTaskError: (error: unknown) => void;
  private readonly tasks: ScheduledTask[] = [];
  private disposed = false;

  constructor(
    timeSource: TimeSource,
    config: PassiveSchedulerConfig = {},
  ) {
    this.timeSource = timeSource;
    this.onTaskError = config.onTaskError ?? (() => {});
  }

  schedule(
    callback: () => void,
    delayMilliseconds: number,
    options: PassiveSchedulerOptions = {},
  ): DisposeHandle {
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

    dueTasks.sort((a, b) => a.dueAt - b.dueAt);

    for (const task of dueTasks) {
      if (task.cancelled) {
        continue;
      }

      try {
        task.callback();
      } catch (error) {
        this.onTaskError(error);
      }

      if (task.repeat) {
        task.dueAt = now + task.interval;
        pendingTasks.push(task);
      }
    }

    this.tasks.length = 0;
    this.tasks.push(...pendingTasks);
  }

  dispose(): void {
    this.disposed = true;
    this.tasks.length = 0;
  }
}
