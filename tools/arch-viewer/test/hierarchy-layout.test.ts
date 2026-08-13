import { describe, expect, test } from "bun:test";

import type { GraphGroup, GraphNode, GraphView } from "../lib/graph/types";
import { layoutView } from "../web/layout/shared";
import type { LayoutGraph, LayoutNode } from "../web/layout/types";

const viewport = { width: 1100, height: 760 } as const;

describe("hierarchy overview layout", () => {
    test("renders top-down group boundaries without exposing files or symbols", () => {
        const source = overviewFixture();
        const graph = layoutView(source, viewport);
        const byId = new Map(graph.nodes.map((item) => [item.id, item]));

        expect(graph.nodes.every((item) => item.kind === "group")).toBe(true);
        expect(byId.get("repository")!.y).toBeLessThan(byId.get("assets")!.y);
        expect(byId.get("assets")!.y).toBeLessThan(byId.get("framework")!.y);
        expect(byId.get("framework")!.y).toBeLessThan(byId.get("framework-core")!.y);
        expect(byId.get("framework")!.detail).toBe("3 files · 6 symbols");
        expect(graph.edges.map((item) => [item.from, item.to])).toContainEqual(["repository", "assets"]);
        expect(graph.edges.map((item) => [item.from, item.to])).toContainEqual(["framework", "framework-core"]);
        expect(byId.has("file:store")).toBe(false);
        expect(byId.has("Store")).toBe(false);
        expectNoOverlap(graph);
        expect(layoutView(source, viewport)).toEqual(graph);
    });

    test("groups large asset and tool branches into wrapped readable regions", () => {
        const graph = layoutView(overviewFixture(), viewport);
        const regions = graph.regions ?? [];
        const assetRegion = regions.find((item) => item.id === "branch:assets")!;
        const toolRegion = regions.find((item) => item.id === "branch:tools")!;

        expect(regions.map((item) => item.id)).toEqual(expect.arrayContaining(["branch:assets", "branch:tools"]));
        expect(assetRegion.x + assetRegion.width).toBeLessThanOrEqual(toolRegion.x);
        expect(graph.width).toBeLessThanOrEqual(1380);
        expect(graph.height).toBeGreaterThan(600);
        expect(graph.nodes.filter((item) => item.laneId === "depth:2").length).toBe(13);
        expectNoOverlap(graph);
    });

    test("shows symbols only after drilling into a file group", () => {
        const source: GraphView = {
            type: "hierarchy",
            rootGroupId: "file:store",
            groups: [group("file:store", 4)],
            nodes: [node("Store", { level: 5, parentId: "file:store" })],
            edges: [],
            diagnostics: [],
        };
        const graph = layoutView(source, viewport);
        const byId = new Map(graph.nodes.map((item) => [item.id, item]));

        expect(graph.nodes.map((item) => item.id)).toEqual(["file:store", "Store"]);
        expect(byId.get("file:store")!.kind).toBe("group");
        expect(byId.get("Store")!.kind).toBe("symbol");
        expect(graph.edges.map((item) => [item.from, item.to])).toContainEqual(["file:store", "Store"]);
    });
});

function overviewFixture(): GraphView {
    const assetChildren = ["audio", "boot", "common", "framework", "game", "game-content", "resources", "samples", "ui"];
    const toolChildren = ["tool-arch-viewer", "tool-creator", "tool-fgui", "tool-fgui-mcp"];
    return {
        type: "hierarchy",
        rootGroupId: "repository",
        groups: [
            group("repository", 0),
            group("assets", 1, "repository"),
            group("tools", 1, "repository"),
            ...assetChildren.map((id) => group(id, 2, "assets")),
            ...toolChildren.map((id) => group(id, 2, "tools")),
            group("framework-core", 3, "framework", "component"),
            group("file:store", 4, "framework-core"),
        ],
        nodes: [node("Store", { level: 5, parentId: "file:store" })],
        edges: [],
        diagnostics: [],
    };
}

function group(id: string, level: number, parentId?: string, kind = "config"): GraphGroup {
    return {
        id,
        label: id,
        ...(parentId === undefined ? {} : { parentId }),
        nodeIds: [],
        metadata: { level, kind, fileCount: level + 1, symbolCount: level * 3 },
    };
}

function node(id: string, metadata: Readonly<Record<string, unknown>>): GraphNode {
    return { id, kind: "symbol", label: id, metadata };
}

function expectNoOverlap(graph: LayoutGraph): void {
    for (let leftIndex = 0; leftIndex < graph.nodes.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < graph.nodes.length; rightIndex += 1) {
            const left = graph.nodes[leftIndex]!;
            const right = graph.nodes[rightIndex]!;
            expect(separated(left, right)).toBe(true);
        }
    }
}

function separated(left: LayoutNode, right: LayoutNode): boolean {
    return left.x + left.width <= right.x || right.x + right.width <= left.x || left.y + left.height <= right.y || right.y + right.height <= left.y;
}
