import type { TimeSource } from "../../contracts/time/TimeSource";

export interface SimulationClockOptions {
  readonly initialTime?: number;
  readonly timeScale?: number;
}

function isValidRate(rate: number): boolean {
  return Number.isFinite(rate) && rate > 0;
}

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
    if (this.paused) {
      return;
    }

    this.currentTime += milliseconds * this.rate;
  }
}
