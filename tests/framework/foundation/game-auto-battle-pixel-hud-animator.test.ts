import { describe, expect, test } from "bun:test";

import type { IViewModelNode } from "../../../assets/framework";
import { createPixelHudAnimator } from "../../../assets/samples/game_auto_battle/view/PixelHudAnimator";
import { clampPresentationElapsed } from "../../../assets/samples/game_auto_battle/view/presenter";

interface RecordingNode {
    alpha: number | undefined;
    writes: number;
}

function recordingNode(): { recording: RecordingNode; node: IViewModelNode } {
    const recording: RecordingNode = {
        alpha: undefined,
        writes: 0,
    };
    const node: IViewModelNode = {
        setText: () => {},
        setProgress: () => {},
        setVisible: () => {},
        onClick: () => {},
        setAlpha: (value: number) => {
            recording.alpha = value;
            recording.writes += 1;
        },
    };
    return { recording, node };
}

describe("Pixel HUD animator", () => {
    test("scanline alpha follows injected time and stays bounded", () => {
        let now = 0;
        const scanline = recordingNode();
        const animator = createPixelHudAnimator({
            timeSource: { now: () => now },
            node: (name) => (name === "bg_scanlines" ? scanline.node : undefined),
            scanlineNode: "bg_scanlines",
        });

        animator.step();
        const initialAlpha = scanline.recording.alpha;
        now = 900;
        animator.step();

        expect(scanline.recording.alpha).toBeGreaterThanOrEqual(0);
        expect(scanline.recording.alpha).toBeLessThanOrEqual(1);
        expect(scanline.recording.alpha).toBeLessThanOrEqual(0.3);
        expect(scanline.recording.alpha).not.toBe(initialAlpha);
        animator.dispose();
    });

    test("skips a missing or alpha-less node", () => {
        const alphaLessNode: IViewModelNode = {
            setText: () => {},
            setProgress: () => {},
            setVisible: () => {},
            onClick: () => {},
        };
        const animator = createPixelHudAnimator({
            timeSource: { now: () => 0 },
            node: () => undefined,
            scanlineNode: "missing_scanlines",
        });

        expect(() => animator.step()).not.toThrow();
        animator.dispose();

        const alphaLessAnimator = createPixelHudAnimator({
            timeSource: { now: () => 0 },
            node: () => alphaLessNode,
            scanlineNode: "alpha_less_scanlines",
        });
        expect(() => alphaLessAnimator.step()).not.toThrow();
        alphaLessAnimator.dispose();
    });

    test("does not write after dispose", () => {
        const scanline = recordingNode();
        const animator = createPixelHudAnimator({
            timeSource: { now: () => 0 },
            node: () => scanline.node,
            scanlineNode: "bg_scanlines",
        });

        animator.step();
        animator.dispose();
        animator.step();

        expect(scanline.recording.writes).toBe(1);
    });

    test("uses the current phase after a time jump without replaying history", () => {
        let now = 0;
        const scanline = recordingNode();
        const animator = createPixelHudAnimator({
            timeSource: { now: () => now },
            node: () => scanline.node,
            scanlineNode: "bg_scanlines",
        });

        now = 1_000_000;
        animator.step();

        expect(scanline.recording.writes).toBe(1);
        expect(scanline.recording.alpha).toBeGreaterThanOrEqual(0);
        expect(scanline.recording.alpha).toBeLessThanOrEqual(1);
        animator.dispose();
    });
});

describe("Pixel HUD presenter elapsed handling", () => {
    test("clamps a wall-clock rollback without poisoning the next tick", () => {
        let lastWallTime = 1_000;
        const elapsed: number[] = [];

        const tick = (wallNow: number): void => {
            elapsed.push(clampPresentationElapsed(wallNow - lastWallTime));
            lastWallTime = wallNow;
        };

        expect(() => tick(900)).not.toThrow();
        tick(1_100);

        expect(elapsed).toEqual([0, 200]);
    });
});
