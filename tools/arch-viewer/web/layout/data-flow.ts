import type { GraphView } from "../../lib/graph/types.js";
import { groupedLaneSpecs, layoutByLanes, metadataString, orderedValues } from "./shared.js";
import type { LayoutGraph, Viewport } from "./types.js";

export function layoutDataFlow(view: GraphView, viewport: Viewport): LayoutGraph {
    const values = orderedValues(view.nodes, (node) => metadataString(node, "lane"));
    return layoutByLanes(
        view,
        groupedLaneSpecs(view.nodes, values, "lane", (node) => metadataString(node, "lane")),
        viewport,
    );
}
