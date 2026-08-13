import type { ImportDependency } from "./source-scanner";
import type { ArchitectureConfig, DependencyRuleConfig } from "../config/types";
import { createEdgeId } from "../graph/ids";
import type { Diagnostic, Evidence, GraphEdge, GraphNode, GraphView } from "../graph/types";

interface MutableEdge {
    readonly from: string;
    readonly to: string;
    readonly relation: string;
    readonly dependencies: ImportDependency[];
}

function relationOf(dependency: ImportDependency): string {
    return dependency.kind === "import" ? "imports" : "exports";
}

function dependencyEvidence(dependency: ImportDependency): Evidence {
    const suffix = dependency.typeOnly ? " (type-only)" : "";
    return {
        source: dependency.fromFile,
        location: { filePath: dependency.fromFile },
        detail: `${dependency.kind} ${dependency.specifier} -> ${dependency.toFile}${suffix}`,
    };
}

function matchingRules(config: ArchitectureConfig, from: string, to: string): readonly DependencyRuleConfig[] {
    return config.dependencyRules.filter((rule) => rule.from === from && rule.to.includes(to));
}

function evaluateEdge(edge: MutableEdge, config: ArchitectureConfig, diagnostics: Diagnostic[]): GraphEdge {
    const id = createEdgeId(edge.from, edge.to, edge.relation);
    const rules = matchingRules(config, edge.from, edge.to);
    const rule = rules[0];
    let status = "unclassified";
    let severity: Diagnostic["severity"] = "warning";
    let color = "orange";
    let reason: string | undefined;

    if (rules.length > 1) {
        diagnostics.push({
            severity: "error",
            message: `Dependency rules overlap for ${edge.from} -> ${edge.to}`,
            source: id,
        });
    }
    if (rule?.exception === true && rule.reason !== undefined) {
        status = "exception";
        severity = "info";
        color = "blue";
        reason = rule.reason;
    } else if (rule?.kind === "deny") {
        status = "denied";
        severity = "error";
        color = "red";
    } else if (rule?.kind === "allow") {
        status = "allowed";
        severity = "info";
        color = "green";
    }

    if (status !== "allowed") {
        const message =
            status === "exception"
                ? `Dependency exception ${edge.from} -> ${edge.to}: ${reason}`
                : status === "denied"
                  ? `Dependency rule denies ${edge.from} -> ${edge.to}`
                  : `Dependency has no matching rule: ${edge.from} -> ${edge.to}`;
        diagnostics.push({ severity, message, source: id });
    }

    const dependencies = [...edge.dependencies].sort(
        (left, right) => left.fromFile.localeCompare(right.fromFile) || (left.toFile ?? "").localeCompare(right.toFile ?? "") || left.specifier.localeCompare(right.specifier),
    );
    const containsTypeOnly = dependencies.some((item) => item.typeOnly);

    return {
        id,
        from: edge.from,
        to: edge.to,
        relation: edge.relation,
        evidence: dependencies.map(dependencyEvidence),
        metadata: {
            status,
            severity,
            color,
            typeOnly: dependencies.every((item) => item.typeOnly),
            containsTypeOnly,
            evidenceCount: dependencies.length,
            matchingRuleCount: rules.length,
            ...(reason === undefined ? {} : { reason }),
        },
    };
}

export function buildDependencyView(config: ArchitectureConfig, imports: readonly ImportDependency[], hierarchy: GraphView): GraphView {
    const ownership = new Map<string, string>();
    for (const group of hierarchy.groups) {
        const filePath = group.metadata?.filePath;
        const ownerGroupId = group.metadata?.ownerGroupId;
        if (typeof filePath === "string" && typeof ownerGroupId === "string") {
            ownership.set(filePath, ownerGroupId);
        }
    }

    const edges = new Map<string, MutableEdge>();
    for (const dependency of imports) {
        const from = ownership.get(dependency.fromFile);
        const to = dependency.toFile === undefined ? undefined : ownership.get(dependency.toFile);
        if (from === undefined || to === undefined || from === to) continue;
        const relation = relationOf(dependency);
        const key = `${from}\0${to}\0${relation}`;
        const edge = edges.get(key);
        if (edge === undefined) {
            edges.set(key, { from, to, relation, dependencies: [dependency] });
        } else {
            edge.dependencies.push(dependency);
        }
    }

    const diagnostics: Diagnostic[] = [];
    const outputEdges = [...edges.values()]
        .sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to) || left.relation.localeCompare(right.relation))
        .map((edge) => evaluateEdge(edge, config, diagnostics));
    const connectedIds = new Set(outputEdges.flatMap((edge) => [edge.from, edge.to]));
    const nodes: GraphNode[] = hierarchy.groups
        .filter((group) => connectedIds.has(group.id))
        .map((group) => ({
            id: group.id,
            kind: "dependency-group",
            label: group.label,
            metadata: {
                fileCount: group.metadata?.fileCount ?? 0,
                symbolCount: group.metadata?.symbolCount ?? 0,
            },
        }));

    return {
        type: "dependencies",
        nodes,
        edges: outputEdges,
        groups: [],
        diagnostics,
    };
}
