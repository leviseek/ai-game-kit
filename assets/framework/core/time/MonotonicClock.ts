import type { TimeSource } from "../../contracts/time/TimeSource";

// The injected source must return finite numbers. Non-finite values such as
// NaN or Infinity are not clamped and would permanently poison the reported
// monotonic reading.
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
