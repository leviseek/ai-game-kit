import { describe, expect, test } from "bun:test";

import type { TimeSource } from "../../../assets/framework/contracts/time/TimeSource";
import { SimulationClock } from "../../../assets/framework/core/time/SimulationClock";

describe("SimulationClock", () => {
    test("starts at the configured initial time", () => {
        const clock = new SimulationClock({ initialTime: 1_000 });

        expect(clock.now()).toBe(1_000);
    });

    test("advances elapsed time while running", () => {
        const clock = new SimulationClock({ initialTime: 0 });

        clock.advance(500);

        expect(clock.now()).toBe(500);
    });

    test("does not advance while paused", () => {
        const clock = new SimulationClock({ initialTime: 0 });

        clock.pause();
        clock.advance(1_000);

        expect(clock.now()).toBe(0);
    });

    test("resumes advancement from the paused time", () => {
        const clock = new SimulationClock({ initialTime: 0 });

        clock.advance(200);
        clock.pause();
        clock.advance(300);
        clock.resume();
        clock.advance(100);

        expect(clock.now()).toBe(300);
    });

    test("scales elapsed time by the configured rate", () => {
        const clock = new SimulationClock({
            initialTime: 0,
            timeScale: 2,
        });

        clock.advance(500);

        expect(clock.now()).toBe(1_000);
    });

    test("applies the rate only to time advanced while running", () => {
        const clock = new SimulationClock({ initialTime: 0, timeScale: 2 });

        clock.advance(100);
        clock.pause();
        clock.advance(400);
        clock.resume();
        clock.advance(100);

        expect(clock.now()).toBe(400);
    });

    test("keeps the previous rate when an invalid rate is rejected", () => {
        const clock = new SimulationClock({ initialTime: 0, timeScale: 2 });

        expect(() => clock.setTimeScale(0)).toThrow();
        expect(clock.timeScale).toBe(2);

        expect(() => clock.setTimeScale(-1)).toThrow();
        expect(clock.timeScale).toBe(2);

        expect(() => clock.setTimeScale(Number.NaN)).toThrow();
        expect(clock.timeScale).toBe(2);

        expect(() => clock.setTimeScale(Number.POSITIVE_INFINITY)).toThrow();
        expect(clock.timeScale).toBe(2);
    });

    test("satisfies the TimeSource contract shape", () => {
        const clock = new SimulationClock();
        const timeSource: TimeSource = clock;

        expect(typeof timeSource.now).toBe("function");
    });

    test("advance is precise and independent of the system wall clock", () => {
        const clock = new SimulationClock({ initialTime: 0, timeScale: 1 });

        clock.advance(123);
        clock.advance(77);

        expect(clock.now()).toBe(200);
    });

    test("rejects negative advance and keeps the current time unchanged", () => {
        const clock = new SimulationClock({ initialTime: 100 });

        expect(() => clock.advance(-1)).toThrow();
        expect(clock.now()).toBe(100);
    });

    test("rejects an invalid timeScale passed to the constructor", () => {
        expect(() => new SimulationClock({ timeScale: 0 })).toThrow();
        expect(() => new SimulationClock({ timeScale: -1 })).toThrow();
        expect(() => new SimulationClock({ timeScale: Number.NaN })).toThrow();
        expect(() => new SimulationClock({ timeScale: Number.POSITIVE_INFINITY })).toThrow();
    });

    test("stays paused after repeated pause calls", () => {
        const clock = new SimulationClock({ initialTime: 0 });

        clock.pause();
        clock.pause();
        clock.advance(1_000);

        expect(clock.now()).toBe(0);
    });

    test("stays running after repeated resume calls", () => {
        const clock = new SimulationClock({ initialTime: 0 });

        clock.pause();
        clock.resume();
        clock.resume();
        clock.advance(100);

        expect(clock.now()).toBe(100);
    });

    test("exposes only the documented simulation API surface", () => {
        const clock = new SimulationClock();

        expect("elapsed" in clock).toBe(false);
        expect("deltaTime" in clock).toBe(false);
        expect("reset" in clock).toBe(false);
    });
});
