import type { CodeGraphGateway } from "../codegraph/gateway";
import type { CodeGraphNode, CodeGraphRelationNode } from "../codegraph/types";
import type { SymbolRef } from "../config/types";
import { createEdgeId } from "../graph/ids";
import type { Diagnostic, Evidence, GraphEdge, GraphNode, GraphView } from "../graph/types";
import { semanticNode } from "./semantic-path";

function isTestFile(filePath: string): boolean {
    return /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)/.test(filePath)
        || /\.(?:test|spec)\.[^/]+$/.test(filePath);
}

function nodeFromRelation(item: CodeGraphRelationNode, role: string): GraphNode {
    return {
        id: `call:${encodeURIComponent(item.filePath)}:${encodeURIComponent(item.name)}:${item.startLine}`,
        kind: item.kind,
        label: item.name,
        qualifiedName: item.name,
        location: { filePath: item.filePath, line: item.startLine },
        evidence: [relationEvidence("codegraph.relation", item, role)],
        metadata: { role: isTestFile(item.filePath) ? "test" : role },
    };
}

function relationEvidence(source: string, item: CodeGraphRelationNode, detail: string): Evidence {
    return {
        source,
        location: { filePath: item.filePath, line: item.startLine },
        detail,
    };
}

function pushEdge(edges: Map<string, GraphEdge>, from: string, to: string, relation: string, evidence: Evidence): void {
    const id = createEdgeId(from, to, relation);
    edges.set(id, { id, from, to, relation, evidence: [evidence], metadata: { evidenceCount: 1 } });
}

async function resolveAnchor(gateway: CodeGraphGateway, ref: SymbolRef): Promise<CodeGraphNode | Diagnostic> {
    return gateway.resolveSymbol(ref);
}

export async function buildCallView(
    gateway: CodeGraphGateway,
    anchors: readonly SymbolRef[],
): Promise<GraphView> {
    const nodes = new Map<string, GraphNode>();
    const edges = new Map<string, GraphEdge>();
    const diagnostics: Diagnostic[] = [];

    for (const ref of anchors) {
        const anchor = await resolveAnchor(gateway, ref);
        if (!("qualifiedName" in anchor)) {
            diagnostics.push({ ...anchor, severity: "error" });
            continue;
        }
        nodes.set(anchor.id, semanticNode(anchor, { role: "incoming" }));

        const [callers, callees, affected] = await Promise.all([
            gateway.callers(anchor.qualifiedName),
            gateway.callees(anchor.qualifiedName),
            gateway.impact(anchor.qualifiedName),
        ]);
        for (const caller of callers) {
            const node = nodeFromRelation(caller, "incoming");
            nodes.set(node.id, node);
            pushEdge(edges, node.id, anchor.id, "calls", relationEvidence("codegraph.callers", caller, "incoming"));
        }
        for (const callee of callees) {
            const node = nodeFromRelation(callee, "outgoing");
            nodes.set(node.id, node);
            pushEdge(edges, anchor.id, node.id, "calls", relationEvidence("codegraph.callees", callee, "outgoing"));
        }
        for (const item of affected) {
            const node = nodeFromRelation(item, "affected");
            if (nodes.has(node.id)) continue;
            nodes.set(node.id, node);
            pushEdge(edges, anchor.id, node.id, "affects", relationEvidence("codegraph.impact", item, "affected"));
        }
    }

    return {
        type: "calls",
        nodes: [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id)),
        edges: [...edges.values()].sort((left, right) => left.id.localeCompare(right.id)),
        groups: [],
        diagnostics: diagnostics.sort((left, right) => (left.source ?? "").localeCompare(right.source ?? "")
            || left.message.localeCompare(right.message)),
    };
}
