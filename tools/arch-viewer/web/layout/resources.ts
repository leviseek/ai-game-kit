import type { GraphView } from "../../lib/graph/types";
import { groupedLaneSpecs, layoutByLanes, metadataString, orderedValues } from "./shared";
import type { LayoutGraph, Viewport } from "./types";

export function layoutResources(view: GraphView, viewport: Viewport): LayoutGraph {
    const values = orderedValues(view.nodes, (node) => metadataString(node, "owner") ?? metadataString(node, "scope"));
    return layoutByLanes(
        view,
        groupedLaneSpecs(view.nodes, values, "owner", (node) => metadataString(node, "owner") ?? metadataString(node, "scope")),
        viewport,
    );
}
