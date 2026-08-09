import { describe, expect, test } from "bun:test";

import type { TimeSource } from "../../../assets/framework/contracts/time/TimeSource";
import { PassiveScheduler } from "../../../assets/framework/core/scheduling/PassiveScheduler";
import { SimulationClock } from "../../../assets/framework/core/time/SimulationClock";

describe("PassiveScheduler", () => {
    test("binds to the supplied time source and drives from it", () => {
        let current = 0;
        const stub: TimeSource = {
            now: () => current,
        };
        const scheduler = new PassiveScheduler(stub);
        let runs = 0;

        scheduler.schedule(() => {
            runs += 1;
        }, 500);

        current = 499;
        scheduler.tick();
        expect(runs).toBe(0);

        current = 500;
        scheduler.tick();
        expect(runs).toBe(1);
    });

    test("does not execute a task before its due time", () => {
        const clock = new SimulationClock({ initialTime: 0 });
        const scheduler = new PassiveScheduler(clock);
        let runs = 0;

        scheduler.schedule(() => {
            runs += 1;
        }, 500);

        clock.advance(499);
        scheduler.tick();

        expect(runs).toBe(0);
    });

    test("executes a task exactly once when the clock reaches its due time", () => {
        const clock = new SimulationClock({ initialTime: 0 });
        const scheduler = new PassiveScheduler(clock);
        let runs = 0;

        scheduler.schedule(() => {
            runs += 1;
        }, 500);

        clock.advance(500);
        scheduler.tick();

        expect(runs).toBe(1);
    });

    test("executes a one-shot task only once across later ticks", () => {
        const clock = new SimulationClock({ initialTime: 0 });
        const scheduler = new PassiveScheduler(clock);
        let runs = 0;

        scheduler.schedule(() => {
            runs += 1;
        }, 500);

        clock.advance(500);
        scheduler.tick();
        clock.advance(1_000);
        scheduler.tick();
        clock.advance(5_000);
        scheduler.tick();

        expect(runs).toBe(1);
    });

    test("executes a repeating task on each interval", () => {
        const clock = new SimulationClock({ initialTime: 0 });
        const scheduler = new PassiveScheduler(clock);
        let runs = 0;

        scheduler.schedule(
            () => {
                runs += 1;
            },
            100,
            { repeat: true },
        );

        clock.advance(100);
        scheduler.tick();
        clock.advance(100);
        scheduler.tick();
        clock.advance(100);
        scheduler.tick();

        expect(runs).toBe(3);
    });

    test("executes multiple due tasks in the same tick", () => {
        const clock = new SimulationClock({ initialTime: 0 });
        const scheduler = new PassiveScheduler(clock);
        const order: string[] = [];

        scheduler.schedule(() => {
            order.push("first");
        }, 200);
        scheduler.schedule(() => {
            order.push("second");
        }, 100);
        scheduler.schedule(() => {
            order.push("third");
        }, 300);

        clock.advance(300);
        scheduler.tick();

        expect(order).toEqual(["second", "first", "third"]);
    });

    test("does not execute tasks while the bound clock is paused", () => {
        const clock = new SimulationClock({ initialTime: 0 });
        const scheduler = new PassiveScheduler(clock);
        let runs = 0;

        scheduler.schedule(() => {
            runs += 1;
        }, 500);

        clock.pause();
        clock.advance(1_000);
        scheduler.tick();

        expect(runs).toBe(0);
    });

    test("executes paused-scheduler tasks after the clock resumes", () => {
        const clock = new SimulationClock({ initialTime: 0 });
        const scheduler = new PassiveScheduler(clock);
        let runs = 0;

        scheduler.schedule(() => {
            runs += 1;
        }, 500);

        clock.pause();
        clock.advance(1_000);
        scheduler.tick();
        clock.resume();
        clock.advance(500);
        scheduler.tick();

        expect(runs).toBe(1);
    });

    test("does not execute without an explicit tick even when due", () => {
        const clock = new SimulationClock({ initialTime: 0 });
        const scheduler = new PassiveScheduler(clock);
        let runs = 0;

        scheduler.schedule(() => {
            runs += 1;
        }, 500);

        clock.advance(1_000);

        expect(runs).toBe(0);
    });

    test("does not execute without an explicit tick across repeated advances", () => {
        const clock = new SimulationClock({ initialTime: 0 });
        const scheduler = new PassiveScheduler(clock);
        let runs = 0;

        scheduler.schedule(() => {
            runs += 1;
        }, 500);

        clock.advance(500);
        clock.advance(500);

        expect(runs).toBe(0);
    });

    test("honors the due time of the bound clock, not the wall clock", () => {
        const clock = new SimulationClock({ initialTime: 1_000 });
        const scheduler = new PassiveScheduler(clock);
        let runs = 0;

        scheduler.schedule(() => {
            runs += 1;
        }, 500);

        clock.advance(499);
        scheduler.tick();

        expect(runs).toBe(0);

        clock.advance(1);
        scheduler.tick();

        expect(runs).toBe(1);
    });
});
