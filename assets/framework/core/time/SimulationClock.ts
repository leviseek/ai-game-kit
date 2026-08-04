import type { TimeSource } from "../../contracts/time/TimeSource";

export interface SimulationClockOptions {
  readonly initialTime?: number;
  readonly timeScale?: number;
}

function isValidRate(rate: number): boolean {
  return Number.isFinite(rate) && rate > 0;
}

/**
 * 模拟时钟：now() 不随真实时间推进，时间只能通过 advance 显式推进，
 * 并受暂停与倍率影响；倍率必须为有限正数（不允许 0 或负数）。
 */
export class SimulationClock implements TimeSource {
  private currentTime: number;
  private rate: number;
  private paused: boolean;

  constructor(options: SimulationClockOptions = {}) {
    this.currentTime = options.initialTime ?? 0;
    this.rate = options.timeScale ?? 1;
    this.paused = false;

    if (!isValidRate(this.rate)) {
      throw new Error("SimulationClock timeScale must be finite and greater than zero");
    }
  }

  now(): number {
    return this.currentTime;
  }

  get timeScale(): number {
    return this.rate;
  }

  setTimeScale(rate: number): void {
    if (!isValidRate(rate)) {
      throw new Error("SimulationClock timeScale must be finite and greater than zero");
    }

    this.rate = rate;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  advance(milliseconds: number): void {
    if (milliseconds < 0) {
      throw new Error("SimulationClock advance must not be negative");
    }

    if (this.paused) {
      return;
    }

    this.currentTime += milliseconds * this.rate;
  }
}
