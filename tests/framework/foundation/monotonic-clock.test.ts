import { describe, expect, test } from "bun:test";

import type { ITimeSource } from "../../../assets/framework/contracts/interfaces/ITimeSource";
import { MonotonicClock } from "../../../assets/framework/core/time/MonotonicClock";

describe("MonotonicClock", () => {
    test("reports a monotonic sequence when the source advances", () => {
        const source = [10, 20, 30];
        const clock = new MonotonicClock(() => source.shift() ?? 0);

        expect(clock.now()).toBe(10);
        expect(clock.now()).toBe(20);
        expect(clock.now()).toBe(30);
    });

    test("does not go backwards when the source moves backwards", () => {
        const source = [5, 3, 4];
        const clock = new MonotonicClock(() => source.shift() ?? 0);

        expect(clock.now()).toBe(5);
        expect(clock.now()).toBe(5);
        expect(clock.now()).toBe(5);
    });

    test("returns the highest value observed so far after a rollback", () => {
        const source = [5, 3, 8, 4];
        const clock = new MonotonicClock(() => source.shift() ?? 0);

        expect(clock.now()).toBe(5);
        expect(clock.now()).toBe(5);
        expect(clock.now()).toBe(8);
        expect(clock.now()).toBe(8);
    });

    test("satisfies the ITimeSource contract shape", () => {
        const clock = new MonotonicClock();
        const timeSource: ITimeSource = clock;

        expect(typeof timeSource.now).toBe("function");
    });

    test("exposes only read time semantics, not elapsed or simulated advance", () => {
        const clock = new MonotonicClock();

        expect("advance" in clock).toBe(false);
        expect("elapsed" in clock).toBe(false);
        expect("pause" in clock).toBe(false);
        expect("timeScale" in clock).toBe(false);
    });
});
