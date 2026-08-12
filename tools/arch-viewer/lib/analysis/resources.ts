import type { CodeGraphGateway } from "../codegraph/gateway";
import type { ResourceLifecycleConfig } from "../config/types";
import type { Diagnostic, GraphEdge, GraphNode, GraphView } from "../graph/types";
import { resolveConfiguredPath } from "./semantic-path";

function stateOf(index: number, count: number): string {
    if (index === 0) return "enter";
    if (index === count - 1) return "exit";
    return "active";
}

function findNode(nodes: readonly GraphNode[], name: string): GraphNode | undefined {
    return nodes.find((node) => node.qualifiedName === name || node.label === name);
}

export async function buildResourceView(
    gateway: CodeGraphGateway,
    resources: readonly ResourceLifecycleConfig[],
): Promise<GraphView> {
    const nodes = new Map<string, GraphNode>();
    const edges = new Map<string, GraphEdge>();
    const diagnostics: Diagnostic[] = [];

    for (const resource of resources) {
        const path = await resolveConfiguredPath(gateway, resource.anchors);
        resource.anchors.forEach((anchor, index) => {
            const node = findNode(path.nodes, anchor.name);
            if (node === undefined) return;
            nodes.set(node.id, {
                ...node,
                metadata: {
                    ...node.metadata,
                    level: index,
                    owner: resource.id,
                    scope: resource.id,
                    state: stateOf(index, resource.anchors.length),
                },
            });
        });
        for (const edge of path.edges) {
            edges.set(edge.id, { ...edge, metadata: { ...edge.metadata, owner: resource.id, scope: resource.id } });
        }
        diagnostics.push(...path.diagnostics);
    }

    return {
        type: "resources",
        nodes: [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id)),
        edges: [...edges.values()].sort((left, right) => left.id.localeCompare(right.id)),
        groups: [],
        diagnostics: diagnostics.sort((left, right) => (left.source ?? "").localeCompare(right.source ?? "")
            || left.message.localeCompare(right.message)),
    };
}
