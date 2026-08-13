import { describe, expect, test } from "bun:test";

import { createInitialCanvasTransform, createWorkbenchRenderCoordinator } from "../web/app";
import type { LayoutGraph } from "../web/layout/types";
import { dragCanvasTransform, hierarchyBandBounds, nodeVisualClass, wheelCanvasTransform } from "../web/render/svg";

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

    test("initial hierarchy render fits a wide architecture overview", () => {
        const layout: LayoutGraph = { width: 2800, height: 600, nodes: [], edges: [], lanes: [] };
        const transform = createInitialCanvasTransform({ clientWidth: 700, clientHeight: 700 }, layout, "hierarchy");

        expect(transform.scale).toBeLessThan(1);
        expect(transform.x).toBeGreaterThanOrEqual(0);
        expect(transform.y).toBeGreaterThanOrEqual(0);
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

describe("hierarchy renderer semantics", () => {
    test("group cards and horizontal hierarchy bands have distinct visuals", () => {
        expect(nodeVisualClass({ kind: "group" }, false)).toBe("node node-group");
        expect(nodeVisualClass({ kind: "symbol" }, true)).toBe("node selected");
        expect(hierarchyBandBounds({ id: "depth:1", label: "Layer 1", index: 1, x: 24, y: 160, orientation: "horizontal" }, 960)).toEqual({
            x: 20,
            y: 160,
            width: 920,
            height: 108,
        });
        expect(hierarchyBandBounds({ id: "lane:a", label: "A", index: 0, x: 48 }, 960)).toBeUndefined();
    });
});
