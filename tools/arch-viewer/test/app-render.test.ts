import { describe, expect, test } from "bun:test";

import { createWorkbenchRenderCoordinator } from "../web/app";
import { dragCanvasTransform, wheelCanvasTransform } from "../web/render/svg";

describe("workbench render coordinator", () => {
    test("transform-only update does not run full canvas or inspector render", () => {
        const calls: string[] = [];
        const coordinator = createWorkbenchRenderCoordinator({
            renderChrome: () => calls.push("chrome"),
            renderCanvas: () => calls.push("canvas"),
            renderInspector: () => calls.push("inspector"),
            updateCanvasTransform: () => calls.push("transform"),
        });

        coordinator.renderAll();
        coordinator.updateTransform();

        expect(calls).toEqual(["chrome", "canvas", "inspector", "transform"]);
    });
});

describe("canvas transform math", () => {
    test("连续 wheel 基于最新 scale 计算", () => {
        const first = wheelCanvasTransform({ x: 0, y: 0, scale: 1 }, -1);
        const second = wheelCanvasTransform(first, -1);

        expect(first.scale).toBeCloseTo(1.1);
        expect(second.scale).toBeCloseTo(1.21);
    });

    test("二次 drag 基于最新 pan origin 计算", () => {
        const first = dragCanvasTransform({ x: 0, y: 0, scale: 1 }, { x: 10, y: 10 }, { x: 15, y: 12 });
        const second = dragCanvasTransform(first, { x: 20, y: 20 }, { x: 22, y: 24 });

        expect(first).toEqual({ x: 5, y: 2, scale: 1 });
        expect(second).toEqual({ x: 7, y: 6, scale: 1 });
    });
});
