import type { GraphNode, GraphView } from "../../lib/graph/types";
import { completeLayout, emptyLayout, estimateNodeSize, laneSpacing, metadataString } from "./shared";
import type { LayoutGraph, LayoutLane, LayoutNode, Viewport } from "./types";

const callOrder = ["incoming", "focus", "outgoing", "affected", "test", "unknown"] as const;

export function layoutCalls(view: GraphView, viewport: Viewport): LayoutGraph {
    if (view.nodes.length === 0) return emptyLayout();

    const values = callOrder.filter((role) => view.nodes.some((node) => roleOf(node) === role));
    const width = Math.max(320, viewport.width);
    const gap = laneSpacing(values.length, viewport);
    const focusIndex = Math.max(0, values.indexOf("focus"));
    const focusX = width / 2;
    const lanes: LayoutLane[] = values.map((role, index) => ({
        id: `role:${role}`,
        label: role,
        index,
        x: focusX + (index - focusIndex) * gap,
    }));
    const nodes: LayoutNode[] = [];

    for (const lane of lanes) {
        const role = values[lane.index];
        if (role === undefined) continue;
        const laneNodes = view.nodes.filter((node) => roleOf(node) === role).sort((left, right) => left.id.localeCompare(right.id));
        laneNodes.forEach((node, row) => {
            const size = estimateNodeSize(node);
            const centerX = role === "focus" ? width / 2 : lane.x + size.width / 2;
            nodes.push({
                id: node.id,
                label: node.label,
                kind: node.kind,
                x: centerX - size.width / 2,
                y: 48 + row * 72,
                width: size.width,
                height: size.height,
                laneId: lane.id,
            });
        });
    }

    const graph = completeLayout(view, lanes, nodes, []);
    return { ...graph, width: Math.max(graph.width, width) };
}

function roleOf(node: GraphNode): string {
    return metadataString(node, "role") ?? "unknown";
}
