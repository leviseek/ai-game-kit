import { describe, expect, test } from "bun:test";

import {
    createMotionTween,
    easeOutCubic,
    easeOutQuad,
} from "../../../assets/framework/core/time/MotionTween";
import type { TimeSource } from "../../../assets/framework";

function makeClock(start = 0): {
    timeSource: TimeSource;
    advance(ms: number): void;
} {
    let value = start;
    return {
        timeSource: { now: () => value },
        advance(ms: number) {
            value += ms;
        },
    };
}

describe("ease curves", () => {
    test("端点固定：0→0，1→1", () => {
        expect(easeOutQuad(0)).toBe(0);
        expect(easeOutQuad(1)).toBe(1);
        expect(easeOutCubic(0)).toBe(0);
        expect(easeOutCubic(1)).toBe(1);
    });

    test("easeOut 曲线起步快于线性（进度 0.5 处超过 0.5）", () => {
        expect(easeOutQuad(0.5)).toBeCloseTo(0.75);
        expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
    });

    test("进度在 0..1 之间保持单调递增", () => {
        let previous = 0;
        for (let t = 0; t <= 1; t += 0.1) {
            const value = easeOutCubic(t);
            expect(value).toBeGreaterThanOrEqual(previous);
            previous = value;
        }
    });
});

describe("createMotionTween", () => {
    test("起点在创建时记录：创建后流逝超过时长，一次 step 即完成", () => {
        const { timeSource, advance } = makeClock(1000);
        const seen: number[] = [];
        let completed = 0;
        const tween = createMotionTween({
            timeSource,
            durationMs: 300,
            onStep: (progress) => {
                seen.push(progress);
            },
            onComplete: () => {
                completed += 1;
            },
        });

        advance(400);
        expect(tween.step()).toBe(false);
        expect(tween.completed).toBe(true);
        expect(seen).toEqual([1]);
        expect(completed).toBe(1);
    });

    test("时长内多次 step 渐进插值（easeOutCubic）", () => {
        const { timeSource, advance } = makeClock(0);
        const seen: number[] = [];
        const tween = createMotionTween({
            timeSource,
            durationMs: 100,
            ease: easeOutCubic,
            onStep: (progress) => {
                seen.push(progress);
            },
        });

        advance(50);
        tween.step();
        advance(50);
        tween.step();

        expect(seen[0]).toBeCloseTo(0.875);
        expect(seen[1]).toBe(1);
    });

    test("未流逝时进度钳位为 0", () => {
        const { timeSource } = makeClock(0);
        const seen: number[] = [];
        const tween = createMotionTween({
            timeSource,
            durationMs: 100,
            onStep: (progress) => {
                seen.push(progress);
            },
        });

        tween.step();
        expect(seen[0]).toBe(0);
    });

    test("完成后 step 不再推进、不再触发 onStep", () => {
        const { timeSource, advance } = makeClock(0);
        let steps = 0;
        const tween = createMotionTween({
            timeSource,
            durationMs: 100,
            onStep: () => {
                steps += 1;
            },
        });

        advance(200);
        tween.step();
        tween.step();
        expect(steps).toBe(1);
        expect(tween.completed).toBe(true);
    });

    test("缺省 ease 为 easeOutQuad", () => {
        const { timeSource, advance } = makeClock(0);
        const seen: number[] = [];
        const tween = createMotionTween({
            timeSource,
            durationMs: 100,
            onStep: (progress) => {
                seen.push(progress);
            },
        });

        advance(50);
        tween.step();
        expect(seen[0]).toBeCloseTo(0.75);
    });
});
