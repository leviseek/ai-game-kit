import { buildCallView } from "./calls";
import { buildDataFlowView } from "./data-flow";
import { buildDependencyView } from "./dependencies";
import { buildHierarchyView } from "./hierarchy";
import { buildResourceView } from "./resources";
import { scanSources } from "./source-scanner";
import { buildStartupView } from "./startup";
import type { CodeGraphGateway } from "../codegraph/gateway";
import { createCodeGraphGateway } from "../codegraph/gateway";
import type { ArchitectureConfig, SymbolRef } from "../config/types";
import { validateArchitectureConfig } from "../config/validate";
import { freezeSnapshot } from "../graph/snapshot";
import type { Diagnostic, GraphSnapshot, GraphView } from "../graph/types";

export interface ArchitectureBuildInput {
    readonly version: number;
}

export interface ArchitectureAnalyzerOptions {
    readonly projectRoot: string;
    readonly config: ArchitectureConfig;
    readonly gateway?: CodeGraphGateway;
    readonly generatedAt?: (input: ArchitectureBuildInput) => number;
}

export class ArchitectureAnalyzer {
    private readonly projectRoot: string;
    private readonly config: ArchitectureConfig;
    private readonly gateway: CodeGraphGateway;
    private readonly generatedAt: (input: ArchitectureBuildInput) => number;

    public constructor(options: ArchitectureAnalyzerOptions) {
        this.projectRoot = options.projectRoot;
        this.config = options.config;
        this.gateway = options.gateway ?? createCodeGraphGateway({ projectRoot: options.projectRoot });
        this.generatedAt = options.generatedAt ?? ((value) => value.version);
    }

    public async buildSnapshot(input: ArchitectureBuildInput): Promise<GraphSnapshot> {
        const statusPromise = this.gateway.status();
        const filesPromise = this.gateway.files();
        const sourcePromise = filesPromise.then((files) =>
            scanSources(
                this.projectRoot,
                files.map((item) => item.path),
            ),
        );

        const [status, files, source] = await Promise.all([statusPromise, filesPromise, sourcePromise]);
        const hierarchy = buildHierarchyView(this.config, source.files, source.declarations);
        const [startup, dataFlows, calls, resources] = await Promise.all([
            buildStartupView(this.gateway, this.config.startup),
            Promise.all(this.config.dataFlows.map((flow) => buildDataFlowView(this.gateway, flow))),
            buildCallView(this.gateway, [findDefaultCallAnchor(this.config)]),
            buildResourceView(this.gateway, this.config.resources),
        ]);
        const views = {
            hierarchy,
            startup,
            dependencies: buildDependencyView(this.config, source.imports, hierarchy),
            "data-flow": mergeViews("data-flow", dataFlows),
            calls,
            resources,
        } satisfies GraphSnapshot["views"];
        const diagnostics = [...validateArchitectureConfig(this.config), ...statusDiagnostics(status), ...Object.values(views).flatMap((view) => view.diagnostics)];

        return freezeSnapshot({
            version: input.version,
            generatedAt: this.generatedAt(input),
            project: {
                root: this.projectRoot,
                fileCount: source.files.length,
                indexedFileCount: files.length,
                symbolCount: source.declarations.length,
                importCount: source.imports.length,
                codegraph: {
                    initialized: status.initialized,
                    version: status.version,
                    projectPath: status.projectPath,
                    indexPath: status.indexPath,
                    lastIndexed: status.lastIndexed,
                    worktreeMismatch: status.worktreeMismatch ?? null,
                },
            },
            views,
            diagnostics,
        });
    }
}

const defaultCallAnchor: SymbolRef = Object.freeze({
    name: "createBootFlow::launch",
    file: "assets/boot/flow/BootFlow.ts",
});

function findDefaultCallAnchor(config: ArchitectureConfig): SymbolRef {
    const anchors = [
        config.startup.entry,
        ...config.startup.phases.flatMap((phase) => phase.anchors),
        ...config.startup.branches.flatMap((branch) => [branch.from, ...branch.anchors]),
        ...config.dataFlows.flatMap((flow) => flow.lanes.flatMap((lane) => lane.anchors)),
        ...config.resources.flatMap((resource) => resource.anchors),
    ];
    return anchors.find((anchor) => anchor.name === defaultCallAnchor.name) ?? defaultCallAnchor;
}

function mergeViews(type: "data-flow", views: readonly GraphView[]): GraphView {
    return {
        type,
        nodes: dedupeById(views.flatMap((view) => view.nodes)),
        edges: dedupeById(views.flatMap((view) => view.edges)),
        groups: dedupeById(views.flatMap((view) => view.groups)),
        diagnostics: views.flatMap((view) => view.diagnostics),
    };
}

function dedupeById<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
    return [...new Map(items.map((item) => [item.id, item])).values()].sort((left, right) => left.id.localeCompare(right.id));
}

function statusDiagnostics(status: Awaited<ReturnType<CodeGraphGateway["status"]>>): readonly Diagnostic[] {
    const mismatch = status.worktreeMismatch;
    if (mismatch === undefined || mismatch === null) return [];
    return [
        {
            severity: "warning",
            source: "codegraph.worktree-mismatch",
            message: `CodeGraph index root ${mismatch.indexRoot} differs from worktree root ${mismatch.worktreeRoot}`,
        },
    ];
}
