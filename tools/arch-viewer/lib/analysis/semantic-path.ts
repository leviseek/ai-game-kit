import type { CodeGraphGateway } from "../codegraph/gateway";
import type { CodeGraphNode, CodeGraphRelationNode } from "../codegraph/types";
import type { SymbolRef } from "../config/types";
import { createEdgeId } from "../graph/ids";
import type { Diagnostic, Evidence, GraphEdge, GraphNode, SourceLocation } from "../graph/types";

export interface ResolvedSemanticPath {
    readonly nodes: readonly GraphNode[];
    readonly edges: readonly GraphEdge[];
    readonly diagnostics: readonly Diagnostic[];
}

interface ResolvedAnchor {
    readonly ref: SymbolRef;
    readonly node?: CodeGraphNode;
}

function locationOf(node: CodeGraphNode): SourceLocation {
    return {
        filePath: node.filePath,
        line: node.startLine,
        column: node.startColumn,
        endLine: node.endLine,
        endColumn: node.endColumn,
    };
}

export function semanticNode(node: CodeGraphNode, metadata: Readonly<Record<string, unknown>> = {}): GraphNode {
    return {
        id: node.id,
        kind: node.kind,
        label: node.name,
        qualifiedName: node.qualifiedName,
        location: locationOf(node),
        evidence: [{ source: "codegraph.symbol", location: locationOf(node), detail: node.qualifiedName }],
        metadata,
    };
}

function relationKey(item: CodeGraphRelationNode): string {
    return `${item.filePath}\0${item.name}\0${item.startLine}`;
}

function matchesRelation(node: CodeGraphNode, relation: CodeGraphRelationNode): boolean {
    return node.filePath === relation.filePath && node.startLine === relation.startLine && (node.name === relation.name || node.qualifiedName === relation.name);
}

function evidenceOf(source: string, item: CodeGraphRelationNode, detail: string): Evidence {
    return {
        source,
        location: { filePath: item.filePath, line: item.startLine },
        detail,
    };
}

async function directEvidence(gateway: CodeGraphGateway, from: CodeGraphNode, to: CodeGraphNode): Promise<readonly Evidence[]> {
    const [callees, callers] = await Promise.all([gateway.callees(from.qualifiedName), gateway.callers(to.qualifiedName)]);
    const callee = callees.find((item) => matchesRelation(to, item));
    if (callee !== undefined) {
        return [evidenceOf("codegraph.callees", callee, `${from.qualifiedName} -> ${to.qualifiedName}`)];
    }
    const caller = callers.find((item) => matchesRelation(from, item));
    if (caller !== undefined) {
        return [evidenceOf("codegraph.callers", caller, `${from.qualifiedName} -> ${to.qualifiedName}`)];
    }
    return [];
}

async function twoHopEvidence(gateway: CodeGraphGateway, from: CodeGraphNode, to: CodeGraphNode): Promise<readonly Evidence[]> {
    const [fromCallees, toCallers] = await Promise.all([gateway.callees(from.qualifiedName), gateway.callers(to.qualifiedName)]);
    const callersByKey = new Map(toCallers.map((item) => [relationKey(item), item]));
    for (const callee of fromCallees) {
        const caller = callersByKey.get(relationKey(callee));
        if (caller === undefined) continue;
        const via = `${callee.name} (${callee.filePath}:${callee.startLine})`;
        return [evidenceOf("codegraph.callees", callee, `${from.qualifiedName} -> ${via}`), evidenceOf("codegraph.callers", caller, `${via} -> ${to.qualifiedName}`)];
    }
    return [];
}

async function findDirectOrTwoHopPath(gateway: CodeGraphGateway, from: CodeGraphNode, to: CodeGraphNode): Promise<readonly Evidence[]> {
    const direct = await directEvidence(gateway, from, to);
    return direct.length > 0 ? direct : twoHopEvidence(gateway, from, to);
}

function semanticEdge(from: CodeGraphNode, to: CodeGraphNode, evidence: readonly Evidence[]): GraphEdge {
    return {
        id: createEdgeId(from.id, to.id, "semantic"),
        from: from.id,
        to: to.id,
        relation: "semantic",
        evidence,
        metadata: {
            declared: evidence.length === 0,
            evidenceCount: evidence.length,
        },
    };
}

async function resolveAnchors(gateway: CodeGraphGateway, anchors: readonly SymbolRef[]): Promise<{ readonly anchors: readonly ResolvedAnchor[]; readonly diagnostics: readonly Diagnostic[] }> {
    const resolved: ResolvedAnchor[] = [];
    const diagnostics: Diagnostic[] = [];
    for (const ref of anchors) {
        const result = await gateway.resolveSymbol(ref);
        if ("qualifiedName" in result) {
            resolved.push({ ref, node: result });
        } else {
            resolved.push({ ref });
            diagnostics.push({ ...result, severity: "error" });
        }
    }
    return { anchors: resolved, diagnostics };
}

export async function resolveConfiguredPath(gateway: CodeGraphGateway, anchors: readonly SymbolRef[]): Promise<ResolvedSemanticPath> {
    const resolved = await resolveAnchors(gateway, anchors);
    const diagnostics = [...resolved.diagnostics];
    const nodes = resolved.anchors
        .map((item) => item.node)
        .filter((node): node is CodeGraphNode => node !== undefined)
        .map((node) => semanticNode(node));
    const edges: GraphEdge[] = [];

    for (let index = 0; index < anchors.length - 1; index += 1) {
        const from = resolved.anchors[index]!.node;
        const to = resolved.anchors[index + 1]!.node;
        if (from === undefined || to === undefined) continue;
        const evidence = await findDirectOrTwoHopPath(gateway, from, to);
        const edge = semanticEdge(from, to, evidence);
        edges.push(edge);
        if (evidence.length === 0) {
            diagnostics.push({
                severity: "warning",
                source: edge.id,
                message: `No CodeGraph evidence for declared semantic edge: ${from.qualifiedName} -> ${to.qualifiedName}`,
            });
        }
    }

    return {
        nodes: [...nodes].sort((left, right) => left.id.localeCompare(right.id)),
        edges: edges.sort((left, right) => left.id.localeCompare(right.id)),
        diagnostics: diagnostics.sort((left, right) => (left.source ?? "").localeCompare(right.source ?? "") || left.message.localeCompare(right.message)),
    };
}
