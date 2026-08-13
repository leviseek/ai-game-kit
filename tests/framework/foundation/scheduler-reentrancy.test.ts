import { describe, expect, spyOn, test } from "bun:test";

import { PassiveScheduler } from "../../../assets/framework/core/scheduling/PassiveScheduler";
import { SimulationClock } from "../../../assets/framework/core/time/SimulationClock";

describe("PassiveScheduler reentrancy", () => {
    test("a callback that calls tick() does not re-execute the same batch", () => {
        const clock = new SimulationClock({ initialTime: 0 });
        const scheduler = new PassiveScheduler(clock);
        let runs = 0;

        scheduler.schedule(() => {
            runs += 1;
            scheduler.tick();
        }, 100);

        clock.advance(100);
        scheduler.tick();

        expect(runs).toBe(1);
    });

    test("a callback that calls tick() does not create an infinite loop", () => {
        const clock = new SimulationClock({ initialTime: 0 });
        const scheduler = new PassiveScheduler(clock);
        let runs = 0;

        scheduler.schedule(() => {
            runs += 1;
            scheduler.tick();
        }, 100);
        scheduler.schedule(() => { }, 200);

        clock.advance(200);
        scheduler.tick();

        expect(runs).toBe(1);
    });

    test("a callback that schedules a new task keeps that task registered", () => {
        const clock = new SimulationClock({ initialTime: 0 });
        const scheduler = new PassiveScheduler(clock);
        let innerRuns = 0;

        scheduler.schedule(() => {
            scheduler.schedule(() => {
                innerRuns += 1;
            }, 0);
        }, 100);

        clock.advance(100);
        scheduler.tick();
        clock.advance(1);
        scheduler.tick();

        expect(innerRuns).toBe(1);
    });

    test("a callback that disposes the scheduler cancels remaining tasks in the same batch", () => {
        const clock = new SimulationClock({ initialTime: 0 });
        const scheduler = new PassiveScheduler(clock);
        let secondRuns = 0;

        scheduler.schedule(() => {
            scheduler.dispose();
        }, 100);
        scheduler.schedule(() => {
            secondRuns += 1;
        }, 100);

        clock.advance(100);
        scheduler.tick();

        expect(secondRuns).toBe(0);
    });

    test("reports task errors through the default console error boundary", () => {
        const clock = new SimulationClock({ initialTime: 0 });
        const scheduler = new PassiveScheduler(clock);
        // mockImplementation 隔离原实现：bun 的 spyOn 默认 callThrough，会继续调用
        // 原 console.error，把传入的 Error 上报给测试运行器；批跑大量文件时被判定为
        // 失败（同 fsm/object-pool 的错误上报用例写法）
        const errorSpy = spyOn(console, "error").mockImplementation(() => { });

        try {
            scheduler.schedule(() => {
                throw new Error("unconfigured failure");
            }, 100);

            clock.advance(100);
            scheduler.tick();

            expect(errorSpy).toHaveBeenCalled();
        } finally {
            errorSpy.mockRestore();
        }
    });

    test("throws when scheduling after the scheduler is disposed", () => {
        const clock = new SimulationClock({ initialTime: 0 });
        const scheduler = new PassiveScheduler(clock);

        scheduler.dispose();

        expect(() => scheduler.schedule(() => { }, 100)).toThrow();
    });

    test("throws for non-finite delay", () => {
        const clock = new SimulationClock({ initialTime: 0 });
        const scheduler = new PassiveScheduler(clock);

        expect(() => scheduler.schedule(() => { }, Number.NaN)).toThrow();
        expect(() => scheduler.schedule(() => { }, Number.POSITIVE_INFINITY)).toThrow();
    });

    test("throws for a negative delay", () => {
        const clock = new SimulationClock({ initialTime: 0 });
        const scheduler = new PassiveScheduler(clock);

        expect(() => scheduler.schedule(() => { }, -1)).toThrow();
    });

    test("a repeating task skipped across a large advance runs once, not once per missed interval", () => {
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

        clock.advance(1_000);
        scheduler.tick();

        expect(runs).toBe(1);
    });

    test("a repeating task re-aligns its phase after a large advance", () => {
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

        clock.advance(1_000);
        scheduler.tick();
        clock.advance(100);
        scheduler.tick();

        expect(runs).toBe(2);
    });
});
