import type { GraphView } from "../../lib/graph/types.js";
import { groupedLaneSpecs, layoutByLanes, metadataString, orderedValues } from "./shared.js";
import type { LayoutGraph, Viewport } from "./types.js";

export function layoutResources(view: GraphView, viewport: Viewport): LayoutGraph {
    const values = orderedValues(view.nodes, (node) => metadataString(node, "owner") ?? metadataString(node, "scope"));
    return layoutByLanes(
        view,
        groupedLaneSpecs(view.nodes, values, "owner", (node) => metadataString(node, "owner") ?? metadataString(node, "scope")),
        viewport,
    );
}
