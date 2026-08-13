import { dirname } from "node:path/posix";

import type { SourceDeclaration } from "./source-scanner";
import { matchProjectGlob } from "./glob";
import type { ArchitectureConfig, HierarchyGroupConfig } from "../config/types";
import type { Diagnostic, GraphGroup, GraphNode, GraphView } from "../graph/types";

interface MutableGroup {
    readonly id: string;
    readonly label: string;
    readonly parentId?: string;
    readonly nodeIds: string[];
    readonly metadata: Record<string, unknown>;
}

interface Owner {
    readonly id: string;
    readonly level: number;
    readonly patterns: readonly string[];
}

interface GroupStats {
    readonly files: Set<string>;
    readonly symbols: Set<string>;
    readonly tests: Set<string>;
}

function normalizePath(value: string): string {
    return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function dynamicId(kind: string, ...parts: readonly string[]): string {
    return ["hierarchy", kind, ...parts].map(encodeURIComponent).join(":");
}

function isTestFile(filePath: string): boolean {
    return /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)/.test(filePath)
        || /\.(?:test|spec)\.[^/]+$/.test(filePath);
}

function patternsOf(group: HierarchyGroupConfig): readonly string[] {
    return group.children.filter((child): child is string => typeof child === "string");
}

export function buildHierarchyView(
    config: ArchitectureConfig,
    files: readonly string[],
    symbols: readonly SourceDeclaration[],
): GraphView {
    const groups: MutableGroup[] = [];
    const groupById = new Map<string, MutableGroup>();
    const owners: Owner[] = [];
    const diagnostics: Diagnostic[] = [];

    const addGroup = (group: MutableGroup): MutableGroup => {
        groups.push(group);
        groupById.set(group.id, group);
        return group;
    };
    const addConfiguredGroup = (
        group: HierarchyGroupConfig,
        parentId: string | undefined,
        level: number,
    ): void => {
        const patterns = patternsOf(group);
        addGroup({
            id: group.id,
            label: group.label,
            ...(parentId === undefined ? {} : { parentId }),
            nodeIds: [],
            metadata: {
                level,
                kind: level === 3 ? "component" : "config",
                ownershipGroup: patterns.length > 0,
                patterns,
            },
        });
        if (patterns.length > 0) owners.push({ id: group.id, level, patterns });
        for (const child of group.children) {
            if (typeof child !== "string") addConfiguredGroup(child, group.id, level + 1);
        }
    };

    addConfiguredGroup(config.hierarchy.root, undefined, 0);

    const normalizedFiles = [...new Set(files.map(normalizePath))].sort();
    const declarationsByFile = new Map<string, SourceDeclaration[]>();
    for (const declaration of symbols) {
        const filePath = normalizePath(declaration.filePath);
        const items = declarationsByFile.get(filePath) ?? [];
        items.push(declaration);
        declarationsByFile.set(filePath, items);
    }
    for (const items of declarationsByFile.values()) {
        items.sort((left, right) => left.startLine - right.startLine || left.id.localeCompare(right.id));
    }

    let unclassified: MutableGroup | undefined;
    const getUnclassified = (): MutableGroup => {
        unclassified ??= addGroup({
            id: dynamicId("unclassified", config.hierarchy.root.id),
            label: "unclassified",
            parentId: config.hierarchy.root.id,
            nodeIds: [],
            metadata: { level: 3, kind: "unclassified", unclassified: true },
        });
        return unclassified;
    };
    const directories = new Map<string, MutableGroup>();
    const fileGroups = new Map<string, MutableGroup>();

    for (const filePath of normalizedFiles) {
        const matches = owners.filter((owner) =>
            owner.patterns.some((pattern) => matchProjectGlob(filePath, pattern)),
        );
        const owner = matches.length === 1 ? matches[0] : undefined;
        let parent = owner === undefined ? getUnclassified() : groupById.get(owner.id)!;
        if (owner !== undefined && owner.level < 3) {
            const directoryPath = dirname(filePath);
            const key = `${owner.id}\0${directoryPath}`;
            let directory = directories.get(key);
            if (directory === undefined) {
                directory = addGroup({
                    id: dynamicId("directory", owner.id, directoryPath),
                    label: directoryPath.split("/").at(-1) ?? directoryPath,
                    parentId: owner.id,
                    nodeIds: [],
                    metadata: {
                        level: 3,
                        kind: "directory",
                        directoryPath,
                        ownerGroupId: owner.id,
                    },
                });
                directories.set(key, directory);
            }
            parent = directory;
        }

        if (matches.length === 0) {
            diagnostics.push({
                severity: "warning",
                message: `File is not classified by hierarchy config: ${filePath}`,
                source: filePath,
            });
        } else if (matches.length > 1) {
            diagnostics.push({
                severity: "error",
                message: `File matches multiple hierarchy groups: ${matches.map((item) => item.id).join(", ")}`,
                source: filePath,
            });
        }

        const declarations = declarationsByFile.get(filePath) ?? [];
        const fileGroup = addGroup({
            id: dynamicId("file", filePath),
            label: filePath.split("/").at(-1) ?? filePath,
            parentId: parent.id,
            nodeIds: declarations.map((item) => item.id),
            metadata: {
                level: 4,
                kind: "file",
                filePath,
                ...(owner === undefined ? {} : { ownerGroupId: owner.id }),
            },
        });
        fileGroups.set(filePath, fileGroup);
    }

    const nodes: GraphNode[] = symbols.map((declaration) => {
        const filePath = normalizePath(declaration.filePath);
        return {
            id: declaration.id,
            kind: declaration.kind,
            label: declaration.name,
            qualifiedName: declaration.qualifiedName,
            location: {
                filePath,
                line: declaration.startLine,
                endLine: declaration.endLine,
            },
            evidence: declaration.occurrences.map((occurrence) => ({
                source: filePath,
                location: {
                    filePath,
                    line: occurrence.startLine,
                    endLine: occurrence.endLine,
                },
                detail: `${occurrence.scopeKind}:${occurrence.memberKind}${occurrence.static ? ":static" : ""}`,
            })),
            metadata: {
                level: 5,
                parentId: fileGroups.get(filePath)?.id,
                exported: declaration.exported,
                occurrenceCount: declaration.occurrences.length,
            },
        };
    }).sort((left, right) =>
        (left.location?.filePath ?? "").localeCompare(right.location?.filePath ?? "")
        || (left.location?.line ?? 0) - (right.location?.line ?? 0)
        || left.id.localeCompare(right.id));

    const stats = new Map<string, GroupStats>();
    const getStats = (id: string): GroupStats => {
        let value = stats.get(id);
        if (value === undefined) {
            value = { files: new Set(), symbols: new Set(), tests: new Set() };
            stats.set(id, value);
        }
        return value;
    };
    for (const [filePath, fileGroup] of fileGroups) {
        const declarationIds = declarationsByFile.get(filePath)?.map((item) => item.id) ?? [];
        let current: MutableGroup | undefined = fileGroup;
        while (current !== undefined) {
            const value = getStats(current.id);
            value.files.add(filePath);
            if (isTestFile(filePath)) value.tests.add(filePath);
            for (const id of declarationIds) value.symbols.add(id);
            current = current.parentId === undefined ? undefined : groupById.get(current.parentId);
        }
    }

    const childCounts = new Map<string, number>();
    for (const group of groups) {
        if (group.parentId !== undefined) {
            childCounts.set(group.parentId, (childCounts.get(group.parentId) ?? 0) + 1);
        }
    }
    const outputGroups: GraphGroup[] = groups.map((group) => {
        const value = getStats(group.id);
        return {
            id: group.id,
            label: group.label,
            ...(group.parentId === undefined ? {} : { parentId: group.parentId }),
            nodeIds: [...group.nodeIds],
            metadata: {
                ...group.metadata,
                childCount: childCounts.get(group.id) ?? 0,
                fileCount: value.files.size,
                symbolCount: value.symbols.size,
                testCount: value.tests.size,
            },
        };
    });

    return {
        type: "hierarchy",
        rootGroupId: config.hierarchy.root.id,
        nodes,
        edges: [],
        groups: outputGroups,
        diagnostics,
    };
}
