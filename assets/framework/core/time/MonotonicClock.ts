import type { TimeSource } from "../../contracts/time/TimeSource";

// 注入的时间源必须返回有限数值。非有限值（如 NaN 或 Infinity）不会被裁剪，
// 会永久污染上报的单调读数。
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
