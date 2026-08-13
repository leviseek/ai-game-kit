import type { GraphView } from "../../lib/graph/types";
import { layoutByLanes, metadataNumber } from "./shared";
import type { LayoutGraph, Viewport } from "./types";

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
