import type { Diagnostic, Evidence, GraphEdge, GraphGroup, GraphNode, GraphSnapshot, GraphView, SourceLocation, ViewType } from "../graph/types";

export type ProjectSummary = Readonly<Record<string, unknown>>;

export interface ArchitectureQueryService {
    project(): ProjectSummary;
    view(type: ViewType): GraphView;
    group(id: string): GraphView | undefined;
    search(query: string): readonly GraphNode[];
    neighborhood(id: string): GraphView | undefined;
}

export function createArchitectureQueryService(snapshot: GraphSnapshot): ArchitectureQueryService {
    return new SnapshotQueryService(snapshot);
}

class SnapshotQueryService implements ArchitectureQueryService {
    public constructor(private readonly snapshot: GraphSnapshot) {}

    public project(): ProjectSummary {
        return { ...this.snapshot.project };
    }

    public view(type: ViewType): GraphView {
        return copyView(this.snapshot.views[type]);
    }

    public group(id: string): GraphView | undefined {
        for (const view of Object.values(this.snapshot.views)) {
            const group = view.groups.find((item) => item.id === id);
            if (group === undefined) continue;
            const childGroupIds = new Set([id, ...collectChildGroupIds(view.groups, id)]);
            const nodeIds = new Set(view.groups.filter((item) => childGroupIds.has(item.id)).flatMap((item) => item.nodeIds));
            return copyView({
                ...view,
                rootGroupId: id,
                groups: view.groups.filter((item) => childGroupIds.has(item.id)),
                nodes: view.nodes.filter((item) => nodeIds.has(item.id)),
                edges: view.edges.filter((item) => nodeIds.has(item.from) && nodeIds.has(item.to)),
                diagnostics: view.diagnostics.filter((item) => item.source === id || item.source === group.metadata?.filePath),
            });
        }
        return undefined;
    }

    public search(query: string): readonly GraphNode[] {
        const normalized = query.trim().toLocaleLowerCase();
        if (normalized === "") return [];
        return allNodes(this.snapshot)
            .filter((node) => nodeMatches(node, normalized))
            .map(copyNode);
    }

    public neighborhood(id: string): GraphView | undefined {
        const sourceView = Object.values(this.snapshot.views).find((view) => view.nodes.some((node) => node.id === id) || view.groups.some((group) => group.id === id));
        if (sourceView === undefined) return undefined;
        const connectedIds = new Set([id]);
        const edges = sourceView.edges.filter((edge) => {
            const connected = edge.from === id || edge.to === id;
            if (connected) {
                connectedIds.add(edge.from);
                connectedIds.add(edge.to);
            }
            return connected;
        });
        return copyView({
            ...sourceView,
            nodes: sourceView.nodes.filter((node) => connectedIds.has(node.id)),
            edges,
            groups: sourceView.groups.filter((group) => group.id === id || group.nodeIds.some((nodeId) => connectedIds.has(nodeId))),
            diagnostics: [],
        });
    }
}

function copyView(view: GraphView): GraphView {
    return {
        ...view,
        nodes: view.nodes.map(copyNode),
        edges: view.edges.map(copyEdge),
        groups: view.groups.map(copyGroup),
        diagnostics: view.diagnostics.map(copyDiagnostic),
    };
}

function copyNode(node: GraphNode): GraphNode {
    return {
        ...node,
        ...(node.metadata === undefined ? {} : { metadata: copyMetadata(node.metadata) }),
        ...(node.location === undefined ? {} : { location: copyLocation(node.location) }),
        ...(node.evidence === undefined ? {} : { evidence: node.evidence.map(copyEvidence) }),
    };
}

function copyEdge(edge: GraphEdge): GraphEdge {
    return {
        ...edge,
        ...(edge.metadata === undefined ? {} : { metadata: copyMetadata(edge.metadata) }),
        ...(edge.evidence === undefined ? {} : { evidence: edge.evidence.map(copyEvidence) }),
    };
}

function copyGroup(group: GraphGroup): GraphGroup {
    return {
        ...group,
        nodeIds: [...group.nodeIds],
        ...(group.metadata === undefined ? {} : { metadata: copyMetadata(group.metadata) }),
    };
}

function copyMetadata(metadata: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, copyMetadataValue(value)]));
}

function copyMetadataValue(value: unknown): unknown {
    if (Array.isArray(value)) return [...value];
    if (isPlainObject(value)) return { ...value };
    return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Object.prototype.toString.call(value) === "[object Object]";
}

function copyDiagnostic(diagnostic: Diagnostic): Diagnostic {
    return {
        ...diagnostic,
        ...(diagnostic.location === undefined ? {} : { location: copyLocation(diagnostic.location) }),
    };
}

function copyEvidence(evidence: Evidence): Evidence {
    return {
        ...evidence,
        ...(evidence.location === undefined ? {} : { location: copyLocation(evidence.location) }),
    };
}

function copyLocation(location: SourceLocation): SourceLocation {
    return { ...location };
}

function collectChildGroupIds(groups: readonly GraphGroup[], id: string): readonly string[] {
    const result: string[] = [];
    const queue = [id];
    while (queue.length > 0) {
        const parentId = queue.shift()!;
        for (const group of groups) {
            if (group.parentId !== parentId) continue;
            result.push(group.id);
            queue.push(group.id);
        }
    }
    return result;
}

function allNodes(snapshot: GraphSnapshot): readonly GraphNode[] {
    const nodes = new Map<string, GraphNode>();
    for (const view of Object.values(snapshot.views)) {
        for (const node of view.nodes) nodes.set(node.id, node);
    }
    return [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function nodeMatches(node: GraphNode, query: string): boolean {
    return (
        node.id.toLocaleLowerCase().includes(query) ||
        node.kind.toLocaleLowerCase().includes(query) ||
        node.label.toLocaleLowerCase().includes(query) ||
        node.qualifiedName?.toLocaleLowerCase().includes(query) === true ||
        node.location?.filePath.toLocaleLowerCase().includes(query) === true
    );
}
