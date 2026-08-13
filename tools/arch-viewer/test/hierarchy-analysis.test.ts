import { describe, expect, test } from "bun:test";

import { buildHierarchyView } from "../lib/analysis/hierarchy";
import { matchProjectGlob } from "../lib/analysis/glob";
import { defineArchitectureConfig, group, symbol } from "../lib/config/builders";
import type { SourceDeclaration } from "../lib/analysis/source-scanner";

function declaration(id: string, filePath: string, qualifiedName: string): SourceDeclaration {
    return {
        id,
        name: qualifiedName.split("::").at(-1) ?? qualifiedName,
        qualifiedName,
        kind: qualifiedName.includes("::") ? "method" : "class",
        filePath,
        startLine: 1,
        endLine: 3,
        exported: true,
        occurrences: [
            {
                startLine: 1,
                endLine: 3,
                scopeKey: "module",
                scopeKind: "module",
                memberKind: qualifiedName.includes("::") ? "method" : "class",
                static: false,
            },
        ],
    };
}

function config() {
    return defineArchitectureConfig({
        hierarchy: {
            root: group("repository", [group("source", [group("framework", [group("framework-core", ["src/framework/{core,shared}/**"])]), group("game", ["src/game/**"])])]),
        },
        dependencyRules: [],
        startup: { entry: symbol("start"), phases: [], branches: [] },
        dataFlows: [],
        resources: [],
    });
}

describe("matchProjectGlob", () => {
    test("matches single-star, double-star, and brace project globs", () => {
        expect(matchProjectGlob("src\\game\\play.ts", "src/{game,framework}/*.ts")).toBe(true);
        expect(matchProjectGlob("src/game/ui/play.ts", "src/{game,framework}/*.ts")).toBe(false);
        expect(matchProjectGlob("src/game/ui/play.ts", "src/**/play.ts")).toBe(true);
        expect(matchProjectGlob("src/game/play.ts", "src/game/play?.ts")).toBe(false);
    });
});

describe("buildHierarchyView", () => {
    test("builds L0-L5 hierarchy, metadata stats, and unclassified files", () => {
        const files = ["src/framework/core/clock.ts", "src/game/play.ts", "src/game/play.test.ts", "misc/orphan.ts"];
        const declarations = [declaration("class:clock", files[0]!, "GameClock"), declaration("method:tick", files[0]!, "GameClock::tick"), declaration("class:play", files[1]!, "PlaySession")];

        const view = buildHierarchyView(config(), files, declarations);
        const groups = new Map(view.groups.map((item) => [item.id, item]));
        const root = groups.get("repository");
        const source = groups.get("source");
        const framework = groups.get("framework");
        const core = groups.get("framework-core");
        const game = groups.get("game");
        const gameDirectory = view.groups.find((item) => item.parentId === "game" && item.metadata?.level === 3);
        const clockFile = view.groups.find((item) => item.metadata?.filePath === "src/framework/core/clock.ts");
        const playFile = view.groups.find((item) => item.metadata?.filePath === "src/game/play.ts");
        const unclassified = view.groups.find((item) => item.metadata?.unclassified === true);
        const orphanFile = view.groups.find((item) => item.metadata?.filePath === "misc/orphan.ts");

        expect(view.type).toBe("hierarchy");
        expect(view.rootGroupId).toBe("repository");
        expect([root?.parentId, root?.metadata?.level]).toEqual([undefined, 0]);
        expect([source?.parentId, source?.metadata?.level]).toEqual(["repository", 1]);
        expect([framework?.parentId, framework?.metadata?.level]).toEqual(["source", 2]);
        expect([core?.parentId, core?.metadata?.level]).toEqual(["framework", 3]);
        expect([game?.parentId, game?.metadata?.level]).toEqual(["source", 2]);
        expect(gameDirectory?.metadata?.kind).toBe("directory");
        expect(clockFile?.parentId).toBe("framework-core");
        expect(clockFile?.metadata?.level).toBe(4);
        expect(playFile?.parentId).toBe(gameDirectory?.id);
        expect(playFile?.nodeIds).toEqual(["class:play"]);
        expect(view.nodes.find((item) => item.id === "class:play")?.metadata?.level).toBe(5);
        expect(unclassified?.parentId).toBe("repository");
        expect(orphanFile?.parentId).toBe(unclassified?.id);
        expect(view.diagnostics).toContainEqual(
            expect.objectContaining({
                severity: "warning",
                source: "misc/orphan.ts",
            }),
        );
        expect(root?.metadata).toEqual(
            expect.objectContaining({
                childCount: 2,
                fileCount: 4,
                symbolCount: 3,
                testCount: 1,
            }),
        );
        expect(core?.metadata).toEqual(
            expect.objectContaining({
                fileCount: 1,
                symbolCount: 2,
                testCount: 0,
            }),
        );
    });

    test("reports overlapping ownership and keeps the file unclassified", () => {
        const overlapConfig = defineArchitectureConfig({
            hierarchy: {
                root: group("root", [group("domains", [group("a", ["src/shared/**"]), group("b", ["src/{shared,other}/**"])])]),
            },
            dependencyRules: [],
            startup: { entry: symbol("start"), phases: [], branches: [] },
            dataFlows: [],
            resources: [],
        });

        const view = buildHierarchyView(overlapConfig, ["src/shared/value.ts"], []);
        const file = view.groups.find((item) => item.metadata?.filePath === "src/shared/value.ts");
        const unclassified = view.groups.find((item) => item.metadata?.unclassified === true);

        expect(file?.parentId).toBe(unclassified?.id);
        expect(file?.metadata?.ownerGroupId).toBeUndefined();
        expect(view.diagnostics).toContainEqual(
            expect.objectContaining({
                severity: "error",
                source: "src/shared/value.ts",
            }),
        );
    });
});
