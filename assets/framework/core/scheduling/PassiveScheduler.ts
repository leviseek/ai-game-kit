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

export class PassiveScheduler {
  private readonly timeSource: TimeSource;
  private readonly onTaskError: (error: unknown) => void;
  private tasks: ScheduledTask[] = [];
  private disposed = false;

  constructor(
    timeSource: TimeSource,
    options: PassiveSchedulerOptions = {},
  ) {
    this.timeSource = timeSource;
    this.onTaskError = options.onTaskError ?? ((error) => console.error(error));
  }

  schedule(
    callback: () => void,
    delayMilliseconds: number,
    options: ScheduleOptions = {},
  ): DisposeHandle {
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
