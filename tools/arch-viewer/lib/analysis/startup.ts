import type { CodeGraphGateway } from "../codegraph/gateway";
import type { StartupConfig } from "../config/types";
import type { Diagnostic, GraphEdge, GraphNode, GraphView } from "../graph/types";
import { resolveConfiguredPath } from "./semantic-path";

function mergeNode(nodes: Map<string, GraphNode>, node: GraphNode, metadata: Readonly<Record<string, unknown>>): void {
    const current = nodes.get(node.id);
    nodes.set(node.id, {
        ...node,
        metadata: { ...current?.metadata, ...node.metadata, ...metadata },
    });
}

function mergeEdge(edges: Map<string, GraphEdge>, edge: GraphEdge, metadata: Readonly<Record<string, unknown>>): void {
    edges.set(edge.id, { ...edge, metadata: { ...edge.metadata, ...metadata } });
}

export async function buildStartupView(gateway: CodeGraphGateway, config: StartupConfig): Promise<GraphView> {
    const nodes = new Map<string, GraphNode>();
    const edges = new Map<string, GraphEdge>();
    const diagnostics: Diagnostic[] = [];

    for (const phase of config.phases) {
        const path = await resolveConfiguredPath(gateway, [config.entry, ...phase.anchors]);
        for (const node of path.nodes) mergeNode(nodes, node, { phase: phase.id });
        for (const edge of path.edges) mergeEdge(edges, edge, { phase: phase.id });
        diagnostics.push(...path.diagnostics);
    }

    for (const branch of config.branches) {
        const path = await resolveConfiguredPath(gateway, [branch.from, ...branch.anchors]);
        for (const node of path.nodes) mergeNode(nodes, node, { branch: branch.id });
        for (const edge of path.edges) mergeEdge(edges, edge, { branch: branch.id });
        diagnostics.push(...path.diagnostics);
    }

    return {
        type: "startup",
        nodes: [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id)),
        edges: [...edges.values()].sort((left, right) => left.id.localeCompare(right.id)),
        groups: [],
        diagnostics: diagnostics.sort((left, right) => (left.source ?? "").localeCompare(right.source ?? "") || left.message.localeCompare(right.message)),
    };
}
