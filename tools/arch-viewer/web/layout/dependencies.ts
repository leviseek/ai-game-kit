import type { GraphEdge, GraphView } from "../../lib/graph/types";
import { layoutByLanes } from "./shared";
import type { LayoutGraph, Viewport } from "./types";

export function layoutDependencies(view: GraphView, viewport: Viewport): LayoutGraph {
    const layers = topologicalLayers(view.nodes.map((node) => node.id), view.edges);
    const laneSpecs = layers.layers.map((nodeIds, index) => ({
        id: `layer:${index}`,
        label: `Layer ${index}`,
        nodeIds,
    }));
    const graph = layoutByLanes(view, laneSpecs, viewport);

    if (layers.cycleEdgeIds.length === 0) return graph;
    const cycleIds = new Set(layers.cycleEdgeIds);
    return {
        ...graph,
        edges: graph.edges.map((edge) => cycleIds.has(edge.id)
            ? { ...edge, diagnosticIds: [...new Set([...edge.diagnosticIds, "layout.cycle"])].sort((left, right) => left.localeCompare(right)) }
            : edge),
    };
}

function topologicalLayers(
    nodeIds: readonly string[],
    edges: readonly GraphEdge[],
): Readonly<{ layers: readonly (readonly string[])[]; cycleEdgeIds: readonly string[] }> {
    const remaining = new Set(nodeIds);
    const incoming = new Map(nodeIds.map((id) => [id, new Set<string>()]));
    const outgoing = new Map(nodeIds.map((id) => [id, new Set<string>()]));
    const nodeIdSet = new Set(nodeIds);

    for (const edge of edges) {
        if (!nodeIdSet.has(edge.from) || !nodeIdSet.has(edge.to)) continue;
        incoming.get(edge.to)?.add(edge.from);
        outgoing.get(edge.from)?.add(edge.to);
    }

    const layers: string[][] = [];
    while (remaining.size > 0) {
        const ready = [...remaining]
            .filter((id) => [...(incoming.get(id) ?? [])].every((source) => !remaining.has(source)))
            .sort((left, right) => left.localeCompare(right));
        if (ready.length === 0) break;
        layers.push(ready);
        for (const id of ready) remaining.delete(id);
    }

    const cycleNodes = [...remaining].sort((left, right) => left.localeCompare(right));
    if (cycleNodes.length === 0) return { layers, cycleEdgeIds: [] };
    layers.push(cycleNodes);
    const cycleNodeSet = new Set(cycleNodes);
    const cycleEdgeIds = edges
        .filter((edge) => cycleNodeSet.has(edge.from) && cycleNodeSet.has(edge.to) && outgoing.get(edge.from)?.has(edge.to) === true)
        .map((edge) => edge.id)
        .sort((left, right) => left.localeCompare(right));

    return { layers, cycleEdgeIds };
}
