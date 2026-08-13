import { describe, expect, test } from "bun:test";

import type { GraphEdge, GraphNode, GraphView, ViewType } from "../lib/graph/types";
import { layoutView } from "../web/layout/shared";
import type { LayoutGraph, LayoutNode } from "../web/layout/types";

const viewport = { width: 900, height: 640 } as const;

function node(id: string, metadata: Readonly<Record<string, unknown>> = {}): GraphNode {
    return { id, kind: "symbol", label: id, metadata };
}

function edge(id: string, from: string, to: string, relation = "uses"): GraphEdge {
    return { id, from, to, relation };
}

function view(type: ViewType, nodes: readonly GraphNode[], edges: readonly GraphEdge[] = []): GraphView {
    return {
        type,
        nodes,
        edges,
        groups: [],
        diagnostics: [{ severity: "error", message: "Denied dependency", source: "edge:error" }],
    };
}

function expectNoOverlap(graph: LayoutGraph): void {
    for (let leftIndex = 0; leftIndex < graph.nodes.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < graph.nodes.length; rightIndex += 1) {
            const left = graph.nodes[leftIndex]!;
            const right = graph.nodes[rightIndex]!;
            const separated = left.x + left.width <= right.x
                || right.x + right.width <= left.x
                || left.y + left.height <= right.y
                || right.y + right.height <= left.y;

            expect(separated).toBe(true);
        }
    }
}

function ids(nodes: readonly LayoutNode[]): readonly string[] {
    return nodes.map((item) => item.id);
}

function lanes(graph: LayoutGraph): readonly string[] {
    return graph.lanes.map((item) => item.id);
}

function expectStable(graph: LayoutGraph, source: GraphView): void {
    expect(layoutView(source, viewport)).toEqual(graph);
}

function expectSameNodeIds(graph: LayoutGraph, source: GraphView): void {
    expect(ids(graph.nodes)).toEqual(source.nodes.map((item) => item.id).sort((left, right) => left.localeCompare(right)));
}

describe("layoutView", () => {
    test("places hierarchy nodes from left to right by depth", () => {
        const source = view("hierarchy", [
            node("leaf", { level: 2 }),
            node("root", { level: 0 }),
            node("branch", { level: 1 }),
        ]);

        const graph = layoutView(source, viewport);
        const byId = new Map(graph.nodes.map((item) => [item.id, item]));

        expect(ids(graph.nodes)).toEqual(["branch", "leaf", "root"]);
        expect(lanes(graph)).toEqual(["depth:0", "depth:1", "depth:2"]);
        expect(byId.get("root")!.x).toBeLessThan(byId.get("branch")!.x);
        expect(byId.get("branch")!.x).toBeLessThan(byId.get("leaf")!.x);
        expectNoOverlap(graph);
        expectStable(graph, source);
    });

    test("places startup nodes by configured phase and branch order", () => {
        const source = view("startup", [
            node("app", { branch: "application" }),
            node("assembly", { phase: "assembly" }),
            node("presentation", { branch: "presentation" }),
        ]);

        const graph = layoutView(source, viewport);

        expect(lanes(graph)).toEqual(["phase:assembly", "branch:application", "branch:presentation"]);
        expectNoOverlap(graph);
        expectStable(graph, source);
    });

    test("keeps startup entry nodes when configured lanes also exist", () => {
        const source = view("startup", [
            node("entry"),
            node("assembly", { phase: "assembly" }),
            node("application", { branch: "application" }),
        ], [edge("edge:entry", "entry", "assembly")]);

        const graph = layoutView(source, viewport);

        expect(lanes(graph)).toEqual(["entry", "phase:assembly", "branch:application"]);
        expectSameNodeIds(graph, source);
        expect(graph.edges.find((item) => item.id === "edge:entry")?.points).not.toEqual([]);
        expectNoOverlap(graph);
        expectStable(graph, source);
    });

    test("places dependency nodes in topological layers and keeps error edge diagnostics", () => {
        const source = view("dependencies", [node("game"), node("framework"), node("ui")], [
            edge("edge:ok", "game", "framework"),
            edge("edge:error", "framework", "ui"),
        ]);

        const graph = layoutView(source, viewport);
        const byId = new Map(graph.nodes.map((item) => [item.id, item]));

        expect(lanes(graph)).toEqual(["layer:0", "layer:1", "layer:2"]);
        expect(byId.get("game")!.x).toBeLessThan(byId.get("framework")!.x);
        expect(byId.get("framework")!.x).toBeLessThan(byId.get("ui")!.x);
        expect(graph.edges.find((item) => item.id === "edge:error")?.diagnosticIds).toEqual(["edge:error"]);
        expectNoOverlap(graph);
        expectStable(graph, source);
    });

    test("puts dependency cycles in the final layer with layout.cycle diagnostics", () => {
        const source = view("dependencies", [node("alpha"), node("beta"), node("root")], [
            edge("edge:root", "root", "alpha"),
            edge("edge:cycle-a", "alpha", "beta"),
            edge("edge:cycle-b", "beta", "alpha"),
        ]);

        const graph = layoutView(source, viewport);
        const byId = new Map(graph.nodes.map((item) => [item.id, item]));

        expect(lanes(graph)).toEqual(["layer:0", "layer:1"]);
        expect(byId.get("root")!.x).toBeLessThan(byId.get("alpha")!.x);
        expect(byId.get("alpha")!.x).toBe(byId.get("beta")!.x);
        expect(graph.edges.find((item) => item.id === "edge:cycle-a")?.diagnosticIds).toContain("layout.cycle");
        expect(graph.edges.find((item) => item.id === "edge:cycle-b")?.diagnosticIds).toContain("layout.cycle");
        expectNoOverlap(graph);
        expectStable(graph, source);
    });

    test("places data-flow nodes by configured lane order", () => {
        const source = view("data-flow", [
            node("input", { lane: "view-input" }),
            node("state", { lane: "state" }),
            node("projection", { lane: "projection" }),
        ]);

        const graph = layoutView(source, viewport);

        expect(lanes(graph)).toEqual(["lane:view-input", "lane:state", "lane:projection"]);
        expectNoOverlap(graph);
        expectStable(graph, source);
    });

    test("keeps call focus nodes centered", () => {
        const source = view("calls", [
            node("caller", { role: "incoming" }),
            node("focus", { role: "focus" }),
            node("callee", { role: "outgoing" }),
        ]);

        const graph = layoutView(source, viewport);
        const focus = graph.nodes.find((item) => item.id === "focus")!;

        expect(lanes(graph)).toEqual(["role:incoming", "role:focus", "role:outgoing"]);
        expect(focus.x + focus.width / 2).toBe(graph.width / 2);
        expectNoOverlap(graph);
        expectStable(graph, source);
    });

    test("keeps call focus centered with extra right-side roles and long labels", () => {
        const source = view("calls", [
            node("caller", { role: "incoming" }),
            node("focus", { role: "focus" }),
            node("callee", { role: "outgoing" }),
            node("affected", { role: "affected" }),
            node("test", { role: "test" }),
            { ...node("unknown"), label: "unknown role with a deliberately long label" },
        ]);

        const graph = layoutView(source, viewport);
        const focus = graph.nodes.find((item) => item.id === "focus")!;

        expect(lanes(graph)).toEqual(["role:incoming", "role:focus", "role:outgoing", "role:affected", "role:test", "role:unknown"]);
        expect(focus.x + focus.width / 2).toBe(graph.width / 2);
        expectSameNodeIds(graph, source);
        expectNoOverlap(graph);
        expectStable(graph, source);
    });

    test("places resource nodes by configured owner order", () => {
        const source = view("resources", [
            node("release", { owner: "global-ui-package", level: 1 }),
            node("preload", { owner: "scene-flow", level: 0 }),
            node("load", { owner: "global-ui-package", level: 0 }),
        ]);

        const graph = layoutView(source, viewport);

        expect(lanes(graph)).toEqual(["owner:global-ui-package", "owner:scene-flow"]);
        expectNoOverlap(graph);
        expectStable(graph, source);
    });

    test("returns a minimum canvas for an empty graph", () => {
        const graph = layoutView(view("startup", []), { width: 80, height: 80 });

        expect(graph.width).toBeGreaterThanOrEqual(320);
        expect(graph.height).toBeGreaterThanOrEqual(240);
        expect(graph.nodes).toEqual([]);
        expect(graph.edges).toEqual([]);
        expect(graph.lanes).toEqual([]);
    });
});
