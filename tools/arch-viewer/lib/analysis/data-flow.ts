import type { CodeGraphGateway } from "../codegraph/gateway";
import type { SemanticFlowConfig } from "../config/types";
import type { Diagnostic, GraphEdge, GraphNode, GraphView } from "../graph/types";
import { resolveConfiguredPath } from "./semantic-path";

function directionOf(index: number, count: number): string {
    if (count === 1) return "through";
    if (index === 0) return "source";
    if (index === count - 1) return "sink";
    return "through";
}

function mergeNode(nodes: Map<string, GraphNode>, node: GraphNode, metadata: Readonly<Record<string, unknown>>): void {
    const current = nodes.get(node.id);
    nodes.set(node.id, {
        ...node,
        metadata: { ...current?.metadata, ...node.metadata, ...metadata },
    });
}

function pushEdge(edges: GraphEdge[], edge: GraphEdge, metadata: Readonly<Record<string, unknown>>): void {
    edges.push({ ...edge, metadata: { ...edge.metadata, ...metadata } });
}

function findNode(nodes: readonly GraphNode[], name: string): GraphNode | undefined {
    return nodes.find((node) => node.qualifiedName === name || node.label === name);
}

export async function buildDataFlowView(gateway: CodeGraphGateway, config: SemanticFlowConfig): Promise<GraphView> {
    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    const diagnostics: Diagnostic[] = [];
    let previousLast: GraphNode | undefined;

    for (const lane of config.lanes) {
        const lanePath = await resolveConfiguredPath(gateway, lane.anchors);
        lane.anchors.forEach((anchor, index) => {
            const node = findNode(lanePath.nodes, anchor.name);
            if (node !== undefined) {
                mergeNode(nodes, node, {
                    lane: lane.id,
                    direction: directionOf(index, lane.anchors.length),
                });
            }
        });
        for (const edge of lanePath.edges) pushEdge(edges, edge, { flow: config.id, lane: lane.id });
        diagnostics.push(...lanePath.diagnostics);

        const firstAnchor = lane.anchors[0];
        const first = firstAnchor === undefined ? undefined : findNode(lanePath.nodes, firstAnchor.name);
        if (previousLast !== undefined && first !== undefined) {
            const bridge = await resolveConfiguredPath(gateway, [
                { name: previousLast.qualifiedName ?? previousLast.label, file: previousLast.location?.filePath },
                { name: first.qualifiedName ?? first.label, file: first.location?.filePath },
            ]);
            for (const edge of bridge.edges) pushEdge(edges, edge, { flow: config.id, lane: lane.id });
            diagnostics.push(...bridge.diagnostics);
        }
        const lastAnchor = lane.anchors.at(-1);
        previousLast = lastAnchor === undefined ? undefined : findNode(lanePath.nodes, lastAnchor.name);
    }

    return {
        type: "data-flow",
        nodes: [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id)),
        edges: edges.sort((left, right) => left.id.localeCompare(right.id)),
        groups: [],
        diagnostics: diagnostics.sort((left, right) => (left.source ?? "").localeCompare(right.source ?? "") || left.message.localeCompare(right.message)),
    };
}
