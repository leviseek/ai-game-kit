import { describe, expect, test } from "bun:test";

import { PassiveScheduler } from "../../../assets/framework/core/scheduling/PassiveScheduler";
import { SimulationClock } from "../../../assets/framework/core/time/SimulationClock";

describe("PassiveScheduler boundary", () => {
    test("released task leaves no residual execution across repeated ticks", () => {
        const clock = new SimulationClock({ initialTime: 0 });
        const scheduler = new PassiveScheduler(clock);
        let runs = 0;

        const handle = scheduler.schedule(() => {
            runs += 1;
        }, 100);

        handle.dispose();
        clock.advance(100);
        scheduler.tick();
        clock.advance(1_000);
        scheduler.tick();
        clock.advance(10_000);
        scheduler.tick();

        expect(runs).toBe(0);
    });

    test("released scheduler leaves no residual execution after any further ticks", () => {
        const clock = new SimulationClock({ initialTime: 0 });
        const scheduler = new PassiveScheduler(clock);
        let runs = 0;

        scheduler.schedule(() => {
            runs += 1;
        }, 100);
        scheduler.schedule(
            () => {
                runs += 1;
            },
            200,
            { repeat: true },
        );

        scheduler.dispose();
        clock.advance(100);
        scheduler.tick();
        clock.advance(10_000);
        scheduler.tick();

        expect(runs).toBe(0);
    });

    test("owner cleanup prevents task execution without implicit global state", () => {
        const clock = new SimulationClock({ initialTime: 0 });
        const scheduler = new PassiveScheduler(clock);
        let runs = 0;

        scheduler.schedule(() => {
            runs += 1;
        }, 100);

        clock.advance(100);
        scheduler.dispose();
        clock.advance(100);
        scheduler.tick();

        expect(runs).toBe(0);
    });

    test("scheduler instances are independent and share no static state", () => {
        const clockA = new SimulationClock({ initialTime: 0 });
        const clockB = new SimulationClock({ initialTime: 0 });
        const schedulerA = new PassiveScheduler(clockA);
        const schedulerB = new PassiveScheduler(clockB);
        let runsA = 0;
        let runsB = 0;

        schedulerA.schedule(() => {
            runsA += 1;
        }, 100);
        schedulerB.schedule(() => {
            runsB += 1;
        }, 100);

        schedulerA.dispose();
        clockA.advance(100);
        schedulerA.tick();
        clockB.advance(100);
        schedulerB.tick();

        expect(runsA).toBe(0);
        expect(runsB).toBe(1);
    });

    test("disposed scheduler rejects no further ownership once fully released", () => {
        const clock = new SimulationClock({ initialTime: 0 });
        const scheduler = new PassiveScheduler(clock);
        let runs = 0;

        scheduler.schedule(() => {
            runs += 1;
        }, 100);

        scheduler.dispose();
        clock.advance(100);
        scheduler.tick();

        expect(runs).toBe(0);
    });
});
