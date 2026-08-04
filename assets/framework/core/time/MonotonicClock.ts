import type { TimeSource } from "../../contracts/time/TimeSource";

export class MonotonicClock implements TimeSource {
  private readonly source: () => number;
  private last: number;

  constructor(source: () => number = () => Date.now()) {
    this.source = source;
    this.last = Number.NEGATIVE_INFINITY;
  }

  now(): number {
    const value = this.source();
    this.last = Math.max(this.last, value);
    return this.last;
  }
}
