import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import architectureConfig from "../architecture.config";
import { ArchitectureAnalyzer } from "../lib/analysis/analyzer";
import { createCodeGraphGateway } from "../lib/codegraph/gateway";
import type { SymbolRef } from "../lib/config/types";

const projectRoot = resolve(import.meta.dir, "..", "..", "..");

describe("repository architecture contract", () => {
    test("resolves configured anchors and covers repository hierarchy", async () => {
        if (!existsSync(resolve(projectRoot, ".codegraph"))) {
            throw new Error(`CodeGraph index is required at ${resolve(projectRoot, ".codegraph")}`);
        }

        const gateway = createCodeGraphGateway({ projectRoot });
        await gateway.sync();
        const status = await gateway.status();
        if (status.worktreeMismatch !== undefined && status.worktreeMismatch !== null) {
            throw new Error(
                `CodeGraph worktree mismatch: index=${status.worktreeMismatch.indexRoot}, worktree=${status.worktreeMismatch.worktreeRoot}`,
            );
        }

        const resolvedAnchors = await Promise.all(allAnchors(architectureConfig).map((anchor) => gateway.resolveSymbol(anchor)));
        const unresolved = resolvedAnchors.filter((item) => !("qualifiedName" in item));
        expect(unresolved).toEqual([]);

        const analyzer = new ArchitectureAnalyzer({ projectRoot, config: architectureConfig, gateway });
        const snapshot = await analyzer.buildSnapshot({ version: 1 });
        const startupNames = snapshot.views.startup.nodes.map((node) => node.qualifiedName ?? node.label);
        expect(startupNames).toEqual(expect.arrayContaining([
            "AppRoot::onLoad",
            "assembleApp",
            "createBootFlow::launch",
            "createSceneFlow::switchTo",
        ]));

        const hierarchy = snapshot.views.hierarchy;
        const coveredToolFiles = hierarchy.groups
            .filter((group) => group.metadata?.ownerGroupId === "tool-arch-viewer")
            .map((group) => group.metadata?.filePath)
            .filter((filePath): filePath is string => typeof filePath === "string" && filePath.endsWith(".ts"));
        expect(coveredToolFiles).toContain("tools/arch-viewer/lib/analysis/analyzer.ts");
        expect(coveredToolFiles).toContain("tools/arch-viewer/architecture.config.ts");

        expect(fileOwner(hierarchy, "assets/boot/AppRoot.ts")).toBe("boot");
        expect(fileOwner(hierarchy, "assets/boot/assembly.ts")).toBe("boot");
        expect(fileOwner(hierarchy, "assets/framework/core/scene/SceneFlow.ts")).toBe("framework-core");

        const ownersByFile = hierarchy.groups
            .filter((group) => typeof group.metadata?.filePath === "string")
            .map((group) => [group.metadata?.filePath, group.metadata?.ownerGroupId] as const);
        const duplicateOwners = ownersByFile.filter(([filePath], index) =>
            ownersByFile.findIndex(([other]) => other === filePath) !== index,
        );
        expect(duplicateOwners).toEqual([]);
        expect(hierarchy.diagnostics.filter((item) =>
            item.severity === "error" && item.message.includes("multiple hierarchy groups"),
        )).toEqual([]);
    }, 60_000);
});

function allAnchors(config: typeof architectureConfig): readonly SymbolRef[] {
    return [
        config.startup.entry,
        ...config.startup.phases.flatMap((phase) => phase.anchors),
        ...config.startup.branches.flatMap((branch) => [branch.from, ...branch.anchors]),
        ...config.dataFlows.flatMap((flow) => flow.lanes.flatMap((lane) => lane.anchors)),
        ...config.resources.flatMap((resource) => resource.anchors),
    ];
}

function fileOwner(
    hierarchy: Awaited<ReturnType<ArchitectureAnalyzer["buildSnapshot"]>>["views"]["hierarchy"],
    filePath: string,
): unknown {
    return hierarchy.groups.find((group) => group.metadata?.filePath === filePath)?.metadata?.ownerGroupId;
}
