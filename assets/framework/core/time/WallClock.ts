import type { TimeSource } from "../../contracts/time/TimeSource";

export class WallClock implements TimeSource {
  private readonly source: () => number;

  constructor(source: () => number = () => Date.now()) {
    this.source = source;
  }

  now(): number {
    return this.source();
  }
}
