import { describe, expect, test } from "bun:test";

import { createEdgeId, createNodeId } from "../lib/graph/ids";
import { freezeSnapshot } from "../lib/graph/snapshot";
import type {
    GraphSnapshot,
    GraphView,
    ViewType,
} from "../lib/graph/types";

const viewTypes = [
    "hierarchy",
    "startup",
    "dependencies",
    "data-flow",
    "calls",
    "resources",
] as const satisfies readonly ViewType[];

function createView(type: ViewType): GraphView {
    return {
        type,
        nodes: [],
        edges: [],
        groups: [],
        diagnostics: [],
    };
}

function createSnapshot(): GraphSnapshot {
    return {
        version: 1,
        generatedAt: 1,
        project: { name: "fixture", rootPath: "/fixture" },
        views: {
            hierarchy: createView("hierarchy"),
            startup: createView("startup"),
            dependencies: createView("dependencies"),
            "data-flow": createView("data-flow"),
            calls: createView("calls"),
            resources: createView("resources"),
        },
        diagnostics: [],
    };
}

describe("graph ids", () => {
    test("相同源码位置生成稳定且 URL-safe 的节点 id", () => {
        const id = createNodeId("function", "assets/a.ts", "createA::run");

        expect(id).toBe("function:assets%2Fa.ts:createA%3A%3Arun");
        expect(id).toBe(
            createNodeId("function", "assets/a.ts", "createA::run"),
        );
    });

    test("相同关系端点生成稳定且有方向的边 id", () => {
        expect(createEdgeId("module:a", "module:b", "imports")).toBe(
            "module%3Aa:module%3Ab:imports",
        );
        expect(createEdgeId("module:a", "module:b", "imports")).not.toBe(
            createEdgeId("module:b", "module:a", "imports"),
        );
    });
});

describe("freezeSnapshot", () => {
    test("保留固定六类视图并深层冻结快照容器", () => {
        const snapshot = freezeSnapshot(createSnapshot());

        expect(Object.keys(snapshot.views)).toEqual(viewTypes);
        expect(Object.isFrozen(snapshot)).toBe(true);
        expect(Object.isFrozen(snapshot.project)).toBe(true);
        expect(Object.isFrozen(snapshot.views)).toBe(true);
        expect(Object.isFrozen(snapshot.views.hierarchy)).toBe(true);
        expect(Object.isFrozen(snapshot.views.hierarchy.nodes)).toBe(true);
        expect(Object.isFrozen(snapshot.views.hierarchy.edges)).toBe(true);
        expect(Object.isFrozen(snapshot.views.hierarchy.groups)).toBe(true);
        expect(Object.isFrozen(snapshot.views.hierarchy.diagnostics)).toBe(true);
        expect(Object.isFrozen(snapshot.diagnostics)).toBe(true);
    });

    test("冻结副本而不冻结调用方提供的数组", () => {
        const input = createSnapshot();
        const inputNodes = input.views.hierarchy.nodes;

        const snapshot = freezeSnapshot(input);

        expect(snapshot.views.hierarchy.nodes).not.toBe(inputNodes);
        expect(Object.isFrozen(inputNodes)).toBe(false);
        expect(Object.isFrozen(snapshot.views.hierarchy.nodes)).toBe(true);
    });
});
