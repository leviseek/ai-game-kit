import { describe, expect, test } from "bun:test";

import type { DisposeHandle } from "../../../assets/framework/core/scheduling/DisposeHandle";
import { PassiveScheduler } from "../../../assets/framework/core/scheduling/PassiveScheduler";
import { SimulationClock } from "../../../assets/framework/core/time/SimulationClock";

describe("DisposeHandle", () => {
    describe("task cancellation", () => {
        test("disposing a task handle prevents the task from running once due", () => {
            const clock = new SimulationClock({ initialTime: 0 });
            const scheduler = new PassiveScheduler(clock);
            let runs = 0;

            const handle = scheduler.schedule(() => {
                runs += 1;
            }, 500);

            handle.dispose();
            clock.advance(500);
            scheduler.tick();

            expect(runs).toBe(0);
        });

        test("disposing a task handle does not invoke its callback", () => {
            const clock = new SimulationClock({ initialTime: 0 });
            const scheduler = new PassiveScheduler(clock);
            let runs = 0;

            const handle = scheduler.schedule(() => {
                runs += 1;
            }, 500);

            handle.dispose();

            expect(runs).toBe(0);
        });

        test("disposing one task does not cancel unrelated tasks", () => {
            const clock = new SimulationClock({ initialTime: 0 });
            const scheduler = new PassiveScheduler(clock);
            let firstRuns = 0;
            let secondRuns = 0;

            scheduler.schedule(() => {
                firstRuns += 1;
            }, 200);
            const handle = scheduler.schedule(() => {
                secondRuns += 1;
            }, 400);

            handle.dispose();
            clock.advance(500);
            scheduler.tick();

            expect(firstRuns).toBe(1);
            expect(secondRuns).toBe(0);
        });
    });

    describe("scheduler disposal", () => {
        test("disposing the scheduler cancels every pending task", () => {
            const clock = new SimulationClock({ initialTime: 0 });
            const scheduler = new PassiveScheduler(clock);
            let runs = 0;

            scheduler.schedule(() => {
                runs += 1;
            }, 300);
            scheduler.schedule(() => {
                runs += 1;
            }, 700);

            scheduler.dispose();
            clock.advance(1_000);
            scheduler.tick();

            expect(runs).toBe(0);
        });

        test("a disposed scheduler ignores further ticks", () => {
            const clock = new SimulationClock({ initialTime: 0 });
            const scheduler = new PassiveScheduler(clock);
            let runs = 0;

            scheduler.schedule(() => {
                runs += 1;
            }, 500);
            scheduler.dispose();

            clock.advance(1_000);
            scheduler.tick();
            clock.advance(1_000);
            scheduler.tick();

            expect(runs).toBe(0);
        });
    });

    describe("idempotent repeated disposal", () => {
        test("disposing a task handle repeatedly is a no-op", () => {
            const clock = new SimulationClock({ initialTime: 0 });
            const scheduler = new PassiveScheduler(clock);
            let runs = 0;

            const handle = scheduler.schedule(() => {
                runs += 1;
            }, 500);

            handle.dispose();
            handle.dispose();
            handle.dispose();
            clock.advance(500);
            scheduler.tick();

            expect(runs).toBe(0);
        });

        test("disposing the scheduler repeatedly is a no-op", () => {
            const clock = new SimulationClock({ initialTime: 0 });
            const scheduler = new PassiveScheduler(clock);
            let runs = 0;

            scheduler.schedule(() => {
                runs += 1;
            }, 500);

            scheduler.dispose();
            scheduler.dispose();
            scheduler.dispose();
            clock.advance(500);
            scheduler.tick();

            expect(runs).toBe(0);
        });
    });

    describe("cancellation of due but not yet driven tasks", () => {
        test("cancelling an already-due task before driving prevents its execution", () => {
            const clock = new SimulationClock({ initialTime: 0 });
            const scheduler = new PassiveScheduler(clock);
            let runs = 0;

            const handle = scheduler.schedule(() => {
                runs += 1;
            }, 500);

            clock.advance(500);
            handle.dispose();
            scheduler.tick();

            expect(runs).toBe(0);
        });

        test("cancelling an overdue task before driving prevents its execution", () => {
            const clock = new SimulationClock({ initialTime: 0 });
            const scheduler = new PassiveScheduler(clock);
            let runs = 0;

            const handle = scheduler.schedule(() => {
                runs += 1;
            }, 500);

            clock.advance(2_000);
            handle.dispose();
            scheduler.tick();

            expect(runs).toBe(0);
        });
    });

    test("satisfies the DisposeHandle contract shape", () => {
        const clock = new SimulationClock({ initialTime: 0 });
        const scheduler = new PassiveScheduler(clock);
        const handle: DisposeHandle = scheduler.schedule(() => { }, 100);

        expect(typeof handle.dispose).toBe("function");
    });
});
