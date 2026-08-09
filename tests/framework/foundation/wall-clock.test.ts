import { describe, expect, test } from "bun:test";

import type { TimeSource } from "../../../assets/framework/contracts/time/TimeSource";
import { WallClock } from "../../../assets/framework/core/time/WallClock";

describe("WallClock", () => {
    test("reports the current system timestamp by default", () => {
        const before = Date.now();
        const clock = new WallClock();
        const now = clock.now();
        const after = Date.now();

        expect(now).toBeGreaterThanOrEqual(before);
        expect(now).toBeLessThanOrEqual(after);
    });

    test("satisfies the TimeSource contract shape", () => {
        const clock = new WallClock();
        const timeSource: TimeSource = clock;

        expect(typeof timeSource.now).toBe("function");
    });

    test("uses the injected source instead of the system clock", () => {
        let current = 1_000;
        const clock = new WallClock(() => current);

        expect(clock.now()).toBe(1_000);

        current = 2_500;
        expect(clock.now()).toBe(2_500);
    });

    test("exposes only read time semantics, not elapsed or simulated advance", () => {
        const clock = new WallClock();

        expect("advance" in clock).toBe(false);
        expect("elapsed" in clock).toBe(false);
        expect("pause" in clock).toBe(false);
        expect("timeScale" in clock).toBe(false);
    });
});
