import { describe, expect, test } from "bun:test";

import { buildDependencyView } from "../lib/analysis/dependencies";
import { buildHierarchyView } from "../lib/analysis/hierarchy";
import type { ImportDependency } from "../lib/analysis/source-scanner";
import { allow, defineArchitectureConfig, deny, group, symbol } from "../lib/config/builders";

function config() {
    return defineArchitectureConfig({
        hierarchy: {
            root: group("repository", [group("domains", [group("framework", ["src/framework/**"]), group("game", ["src/game/**"]), group("legacy", ["src/legacy/**"])])]),
        },
        dependencyRules: [
            deny("framework", ["game"]),
            allow("game", ["framework"]),
            deny("framework", ["legacy"], {
                exception: true,
                reason: "Legacy bridge is removed after migration",
            }),
        ],
        startup: { entry: symbol("start"), phases: [], branches: [] },
        dataFlows: [],
        resources: [],
    });
}

function dependency(fromFile: string, toFile: string, typeOnly = false): ImportDependency {
    return {
        fromFile,
        toFile,
        specifier: `./${toFile.split("/").at(-1)}`,
        kind: "import",
        typeOnly,
        external: false,
    };
}

describe("buildDependencyView", () => {
    test("aggregates cross-group evidence, marks type-only imports, and reports rules", () => {
        const files = ["src/framework/service.ts", "src/framework/bridge.ts", "src/game/model.ts", "src/game/view.ts", "src/legacy/api.ts"];
        const architectureConfig = config();
        const hierarchy = buildHierarchyView(architectureConfig, files, []);
        const imports = [
            dependency(files[0]!, files[2]!),
            dependency(files[0]!, files[3]!, true),
            dependency(files[2]!, files[0]!, true),
            dependency(files[3]!, files[1]!),
            dependency(files[2]!, files[3]!),
            dependency(files[1]!, files[4]!),
        ];

        const view = buildDependencyView(architectureConfig, imports, hierarchy);
        const frameworkToGame = view.edges.find((item) => item.from === "framework" && item.to === "game");
        const gameToFramework = view.edges.find((item) => item.from === "game" && item.to === "framework");
        const frameworkToLegacy = view.edges.find((item) => item.from === "framework" && item.to === "legacy");

        expect(view.type).toBe("dependencies");
        expect(view.edges).toHaveLength(3);
        expect(frameworkToGame?.evidence?.map((item) => item.source)).toEqual(["src/framework/service.ts", "src/framework/service.ts"]);
        expect(frameworkToGame?.metadata).toEqual(
            expect.objectContaining({
                status: "denied",
                severity: "error",
                color: "red",
                typeOnly: false,
                containsTypeOnly: true,
            }),
        );
        expect(gameToFramework?.evidence?.map((item) => item.source)).toEqual(["src/game/model.ts", "src/game/view.ts"]);
        expect(gameToFramework?.metadata).toEqual(
            expect.objectContaining({
                status: "allowed",
                typeOnly: false,
                containsTypeOnly: true,
            }),
        );
        expect(frameworkToLegacy?.metadata).toEqual(
            expect.objectContaining({
                status: "exception",
                severity: "info",
            }),
        );
        expect(view.diagnostics).toContainEqual(
            expect.objectContaining({
                severity: "error",
                source: frameworkToGame?.id,
            }),
        );
        expect(view.diagnostics).toContainEqual(
            expect.objectContaining({
                severity: "info",
                source: frameworkToLegacy?.id,
                message: expect.stringContaining("Legacy bridge"),
            }),
        );
    });

    test("omits self edges, external dependencies, and dependencies without ownership", () => {
        const architectureConfig = config();
        const hierarchy = buildHierarchyView(architectureConfig, ["src/game/a.ts", "src/game/b.ts", "misc/orphan.ts"], []);
        const imports: readonly ImportDependency[] = [
            dependency("src/game/a.ts", "src/game/b.ts"),
            dependency("misc/orphan.ts", "src/game/a.ts"),
            {
                fromFile: "src/game/a.ts",
                specifier: "typescript",
                kind: "import",
                typeOnly: false,
                external: true,
            },
        ];

        expect(buildDependencyView(architectureConfig, imports, hierarchy).edges).toEqual([]);
    });

    test("keeps exception rules without reason denied", () => {
        const architectureConfig = defineArchitectureConfig({
            ...config(),
            dependencyRules: [deny("framework", ["legacy"], { exception: true })],
        });
        const files = ["src/framework/bridge.ts", "src/legacy/api.ts"];
        const hierarchy = buildHierarchyView(architectureConfig, files, []);

        const view = buildDependencyView(architectureConfig, [dependency(files[0]!, files[1]!)], hierarchy);
        const edge = view.edges[0];

        expect(edge?.metadata).toEqual(
            expect.objectContaining({
                status: "denied",
                severity: "error",
                color: "red",
            }),
        );
        expect(edge?.metadata?.reason).toBeUndefined();
        expect(view.diagnostics).toContainEqual(
            expect.objectContaining({
                severity: "error",
                message: "Dependency rule denies framework -> legacy",
                source: edge?.id,
            }),
        );
    });
});
