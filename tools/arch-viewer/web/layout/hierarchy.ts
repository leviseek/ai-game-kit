import type { GraphView } from "../../lib/graph/types.js";
import { layoutByLanes, metadataNumber } from "./shared.js";
import type { LayoutGraph, Viewport } from "./types.js";

export function layoutHierarchy(view: GraphView, viewport: Viewport): LayoutGraph {
    const levels = [...new Set(view.nodes.map((node) => metadataNumber(node, "level") ?? 0))]
        .sort((left, right) => left - right);
    const lanes = levels.map((level) => ({
        id: `depth:${level}`,
        label: `Depth ${level}`,
        nodeIds: view.nodes.filter((node) => (metadataNumber(node, "level") ?? 0) === level).map((node) => node.id),
    }));

    return layoutByLanes(view, lanes, viewport);
}
