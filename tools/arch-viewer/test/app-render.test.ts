import { describe, expect, test } from "bun:test";

import { createWorkbenchRenderCoordinator } from "../web/app";

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
