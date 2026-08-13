import type { GraphView } from "../../lib/graph/types";
import { groupedLaneSpecs, layoutByLanes, metadataString, orderedValues } from "./shared";
import type { LayoutGraph, Viewport } from "./types";

export function layoutDataFlow(view: GraphView, viewport: Viewport): LayoutGraph {
    const values = orderedValues(view.nodes, (node) => metadataString(node, "lane"));
    return layoutByLanes(view, groupedLaneSpecs(view.nodes, values, "lane", (node) => metadataString(node, "lane")), viewport);
}
