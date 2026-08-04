import type { TimeSource } from "../../contracts/time/TimeSource";

/**
 * 墙钟：默认读取 Date.now() 作为时间戳；可注入 now 以便测试或模拟。
 */
export class WallClock implements TimeSource {
  private readonly source: () => number;

  constructor(source: () => number = () => Date.now()) {
    this.source = source;
  }

  now(): number {
    return this.source();
  }
}
