import type { GraphNode, GraphView } from "../../lib/graph/types";
import { completeLayout, emptyLayout, estimateNodeSize, laneSpacing, metadataString } from "./shared";
import type { LayoutGraph, LayoutLane, LayoutNode, Viewport } from "./types";

const callOrder = ["incoming", "focus", "outgoing", "affected", "test", "unknown"] as const;
type CallRole = (typeof callOrder)[number];
const callRoles = new Set<string>(callOrder);

export function layoutCalls(view: GraphView, viewport: Viewport): LayoutGraph {
    if (view.nodes.length === 0) return emptyLayout();

    const values = callOrder.filter((role) => view.nodes.some((node) => roleOf(node) === role));
    const width = Math.max(320, viewport.width);
    const gap = laneSpacing(values.length, viewport);
    const focusIndex = Math.max(0, values.indexOf("focus"));
    const focusX = finalFocusX(view, values, focusIndex, width, gap);
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
            const centerX = role === "focus" ? focusX : lane.x + size.width / 2;
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
    return { ...graph, width: Math.max(graph.width, focusX * 2) };
}

function roleOf(node: GraphNode): CallRole {
    const role = metadataString(node, "role");
    return role !== undefined && callRoles.has(role) ? role as CallRole : "unknown";
}

function finalFocusX(
    view: GraphView,
    values: readonly string[],
    focusIndex: number,
    minWidth: number,
    gap: number,
): number {
    const maxRightFromFocus = Math.max(0, ...values.map((role, index) => {
        const maxWidth = Math.max(0, ...view.nodes
            .filter((node) => roleOf(node) === role)
            .map((node) => estimateNodeSize(node).width));
        return (index - focusIndex) * gap + maxWidth;
    }));
    return Math.max(minWidth / 2, maxRightFromFocus + 48);
}
