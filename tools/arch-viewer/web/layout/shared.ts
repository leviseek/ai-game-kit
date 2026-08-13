import type { Diagnostic, GraphEdge, GraphNode, GraphView } from "../../lib/graph/types";
import { layoutCalls } from "./calls";
import { layoutDataFlow } from "./data-flow";
import { layoutDependencies } from "./dependencies";
import { layoutHierarchy } from "./hierarchy";
import { layoutResources } from "./resources";
import { layoutStartup } from "./startup";
import type { LayoutEdge, LayoutGraph, LayoutLane, LayoutNode, LayoutPoint, Viewport } from "./types";

const minCanvasWidth = 320;
const minCanvasHeight = 240;
const margin = 48;
const minLaneGap = 150;
const maxLaneGap = 260;
const nodeHeight = 44;
const rowGap = 28;

export function layoutView(view: GraphView, viewport: Viewport): LayoutGraph {
    switch (view.type) {
        case "hierarchy": return layoutHierarchy(view, viewport);
        case "startup": return layoutStartup(view, viewport);
        case "dependencies": return layoutDependencies(view, viewport);
        case "data-flow": return layoutDataFlow(view, viewport);
        case "calls": return layoutCalls(view, viewport);
        case "resources": return layoutResources(view, viewport);
    }
}

export function layoutByLanes(
    view: GraphView,
    laneSpecs: readonly Readonly<{ id: string; label: string; nodeIds: readonly string[] }>[],
    viewport: Viewport,
): LayoutGraph {
    if (view.nodes.length === 0) return emptyLayout();

    const laneGap = laneSpacing(laneSpecs.length, viewport);
    const lanes = laneSpecs.map((lane, index): LayoutLane => ({
        id: lane.id,
        label: lane.label,
        index,
        x: margin + index * laneGap,
    }));
    const nodeById = new Map(view.nodes.map((node) => [node.id, node]));
    const nodes: LayoutNode[] = [];

    for (const lane of lanes) {
        const spec = laneSpecs[lane.index];
        if (spec === undefined) continue;
        const sortedIds = [...spec.nodeIds].sort((left, right) => left.localeCompare(right));
        sortedIds.forEach((id, row) => {
            const source = nodeById.get(id);
            if (source === undefined) return;
            const size = estimateNodeSize(source);
            nodes.push({
                id: source.id,
                label: source.label,
                kind: source.kind,
                x: lane.x,
                y: margin + row * (nodeHeight + rowGap),
                width: size.width,
                height: size.height,
                laneId: lane.id,
            });
        });
    }

    return completeLayout(view, lanes, nodes, []);
}

export function completeLayout(
    view: GraphView,
    lanes: readonly LayoutLane[],
    nodes: readonly LayoutNode[],
    extraEdgeDiagnostics: readonly Readonly<{ edgeId: string; diagnosticId: string }>[],
): LayoutGraph {
    const sortedNodes = [...nodes].sort((left, right) => left.id.localeCompare(right.id));
    const edges = routeEdges(view.edges, sortedNodes, view.diagnostics, extraEdgeDiagnostics);
    const width = Math.max(minCanvasWidth, maxRight(sortedNodes, lanes) + margin);
    const height = Math.max(minCanvasHeight, maxBottom(sortedNodes) + margin);

    return { width, height, nodes: sortedNodes, edges, lanes };
}

export function emptyLayout(): LayoutGraph {
    return { width: minCanvasWidth, height: minCanvasHeight, nodes: [], edges: [], lanes: [] };
}

export function estimateNodeSize(node: GraphNode): Readonly<{ width: number; height: number }> {
    return {
        width: clamp(80, 220, node.label.length * 8 + 32),
        height: nodeHeight,
    };
}

export function metadataString(node: GraphNode, key: string): string | undefined {
    const value = node.metadata?.[key];
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function metadataNumber(node: GraphNode, key: string): number | undefined {
    const value = node.metadata?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function orderedValues(nodes: readonly GraphNode[], read: (node: GraphNode) => string | undefined): readonly string[] {
    const values: string[] = [];
    for (const node of nodes) {
        const value = read(node) ?? "unassigned";
        if (!values.includes(value)) values.push(value);
    }
    return values;
}

export function groupedLaneSpecs(
    nodes: readonly GraphNode[],
    values: readonly string[],
    prefix: string,
    read: (node: GraphNode) => string | undefined,
): readonly Readonly<{ id: string; label: string; nodeIds: readonly string[] }>[] {
    return values.map((value) => ({
        id: prefix === "" ? value : `${prefix}:${value}`,
        label: value,
        nodeIds: nodes.filter((node) => (read(node) ?? "unassigned") === value).map((node) => node.id),
    }));
}

export function laneSpacing(laneCount: number, viewport: Viewport): number {
    if (laneCount <= 1) return 0;
    const available = Math.max(0, viewport.width - margin * 2);
    return clamp(minLaneGap, maxLaneGap, Math.floor(available / Math.max(1, laneCount - 1)));
}

function routeEdges(
    edges: readonly GraphEdge[],
    nodes: readonly LayoutNode[],
    diagnostics: readonly Diagnostic[],
    extraEdgeDiagnostics: readonly Readonly<{ edgeId: string; diagnosticId: string }>[],
): readonly LayoutEdge[] {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const sourceDiagnostics = new Map<string, string[]>();
    for (const diagnostic of diagnostics) {
        if (diagnostic.source === undefined) continue;
        const ids = sourceDiagnostics.get(diagnostic.source) ?? [];
        ids.push(diagnostic.source);
        sourceDiagnostics.set(diagnostic.source, ids);
    }
    for (const item of extraEdgeDiagnostics) {
        const ids = sourceDiagnostics.get(item.edgeId) ?? [];
        ids.push(item.diagnosticId);
        sourceDiagnostics.set(item.edgeId, ids);
    }

    return [...edges]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((edge): LayoutEdge => ({
            id: edge.id,
            from: edge.from,
            to: edge.to,
            relation: edge.relation,
            ...(edge.label === undefined ? {} : { label: edge.label }),
            points: routeEdge(nodeById.get(edge.from), nodeById.get(edge.to)),
            diagnosticIds: [...new Set(sourceDiagnostics.get(edge.id) ?? [])].sort((left, right) => left.localeCompare(right)),
        }));
}

function routeEdge(from: LayoutNode | undefined, to: LayoutNode | undefined): readonly LayoutPoint[] {
    if (from === undefined || to === undefined) return [];
    const start = { x: from.x + from.width, y: from.y + from.height / 2 };
    const end = { x: to.x, y: to.y + to.height / 2 };
    if (start.x <= end.x) {
        const middleX = start.x + (end.x - start.x) / 2;
        return [start, { x: middleX, y: start.y }, { x: middleX, y: end.y }, end];
    }
    return [start, end];
}

function maxRight(nodes: readonly LayoutNode[], lanes: readonly LayoutLane[]): number {
    return Math.max(0, ...nodes.map((node) => node.x + node.width), ...lanes.map((lane) => lane.x));
}

function maxBottom(nodes: readonly LayoutNode[]): number {
    return Math.max(0, ...nodes.map((node) => node.y + node.height));
}

function clamp(min: number, max: number, value: number): number {
    return Math.max(min, Math.min(max, value));
}
