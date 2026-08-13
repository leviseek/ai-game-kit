import type { GraphNode, GraphView } from "../../lib/graph/types";
import { groupedLaneSpecs, layoutByLanes, metadataString } from "./shared";
import type { LayoutGraph, Viewport } from "./types";

export function layoutStartup(view: GraphView, viewport: Viewport): LayoutGraph {
    const entries = view.nodes.some((node) => startupLaneValue(node) === "entry") ? ["entry"] : [];
    const phases = orderedStartupValues(view.nodes, "phase", "phase");
    const branches = orderedStartupValues(view.nodes, "branch", "branch");
    const values = [...entries, ...phases, ...branches];
    return layoutByLanes(view, groupedLaneSpecs(view.nodes, values, "", startupLaneValue), viewport);
}

function orderedStartupValues(nodes: readonly GraphNode[], key: "phase" | "branch", prefix: string): readonly string[] {
    const values: string[] = [];
    for (const node of nodes) {
        const value = metadataString(node, key);
        if (value === undefined) continue;
        const lane = `${prefix}:${value}`;
        if (!values.includes(lane)) values.push(lane);
    }
    return values;
}

function startupLaneValue(node: GraphNode): string | undefined {
    const phase = metadataString(node, "phase");
    if (phase !== undefined) return `phase:${phase}`;
    const branch = metadataString(node, "branch");
    if (branch !== undefined) return `branch:${branch}`;
    return "entry";
}
