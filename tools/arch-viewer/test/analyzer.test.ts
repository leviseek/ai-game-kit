import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { ArchitectureAnalyzer } from "../lib/analysis/analyzer";
import { createArchitectureQueryService } from "../lib/analysis/query-service";
import {
    allow,
    branch,
    defineArchitectureConfig,
    flow,
    group,
    lifecycle,
    phase,
    symbol,
} from "../lib/config/builders";
import type { GraphSnapshot, ViewType } from "../lib/graph/types";
import { codeGraphFixture, createFixtureGateway } from "./fixtures/codegraph-fixture";

const roots: string[] = [];
const viewTypes: readonly ViewType[] = ["hierarchy", "startup", "dependencies", "data-flow", "calls", "resources"];

function createFixtureRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "arch-analyzer-"));
    roots.push(root);
    for (const [filePath, source] of Object.entries(codeGraphFixture.files)) {
        const fullPath = join(root, filePath);
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, source);
    }
    return root;
}

function config() {
    return defineArchitectureConfig({
        hierarchy: {
            root: group("repository", [
                group("source", [
                    group("app", ["src/app.ts", "src/assembly.ts", "src/boot.ts", "src/scene.ts"]),
                    group("ui", ["src/ui.ts"]),
                    group("state", ["src/store.ts"]),
                ]),
            ]),
        },
        dependencyRules: [
            allow("app", ["ui"]),
            allow("ui", ["state"]),
        ],
        startup: {
            entry: symbol("AppRoot::onLoad", "src/app.ts"),
            phases: [phase("assembly", [
                symbol("assembleApp", "src/assembly.ts"),
                symbol("createSceneFlow", "src/scene.ts"),
                symbol("createBootFlow", "src/boot.ts"),
            ])],
            branches: [
                branch("presentation", symbol("AppRoot::start", "src/app.ts"), [
                    symbol("createBootFlow::launch", "src/boot.ts"),
                    symbol("createSceneFlow::switchTo", "src/scene.ts"),
                    symbol("UiHost::init", "src/ui.ts"),
                ]),
            ],
        },
        dataFlows: [flow("close-dialog", [
            { id: "view-input", anchors: [
                symbol("CloseDialog::bind", "src/ui.ts"),
                symbol("CloseDialog::_handleConfirm", "src/ui.ts"),
            ] },
            { id: "state", anchors: [symbol("closeDialogReducer", "src/store.ts")] },
            { id: "projection", anchors: [
                symbol("projectCloseDialog", "src/store.ts"),
                symbol("CloseDialog::onState", "src/ui.ts"),
            ] },
        ])],
        resources: [
            lifecycle("global-ui-package", [
                symbol("UiHost::loadPackage", "src/ui.ts"),
                symbol("UiHost::release", "src/ui.ts"),
            ]),
            lifecycle("scene-flow", [
                symbol("createSceneFlow::preload", "src/scene.ts"),
                symbol("createSceneFlow::switchTo", "src/scene.ts"),
                symbol("createSceneFlow::currentFlowScope", "src/scene.ts"),
            ]),
        ],
    });
}

afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("ArchitectureAnalyzer", () => {
    test("builds a complete frozen and stable snapshot from fixture projections", async () => {
        const analyzer = new ArchitectureAnalyzer({
            projectRoot: createFixtureRoot(),
            config: config(),
            gateway: createFixtureGateway(),
        });

        const snapshot = await analyzer.buildSnapshot({ version: 7 });
        const repeated = await analyzer.buildSnapshot({ version: 7 });

        expect(snapshot.version).toBe(7);
        expect(snapshot.generatedAt).toBe(7);
        expect(Object.keys(snapshot.views)).toEqual(viewTypes);
        expect(snapshot.diagnostics).toEqual(viewTypes.flatMap((type) => snapshot.views[type].diagnostics));
        expect(snapshot.views.calls.nodes.find((item) => item.qualifiedName === "createBootFlow::launch")?.metadata)
            .toEqual(expect.objectContaining({ role: "incoming" }));
        expect(snapshot.diagnostics).toContainEqual(expect.objectContaining({
            severity: "warning",
            message: expect.stringContaining("No CodeGraph evidence"),
        }));
        expect(isDeepFrozen(snapshot)).toBe(true);
        expect(stableSnapshot(snapshot)).toEqual(stableSnapshot(repeated));
    });

    test("query service returns defensive view, group, search and neighborhood copies", async () => {
        const analyzer = new ArchitectureAnalyzer({
            projectRoot: createFixtureRoot(),
            config: config(),
            gateway: createFixtureGateway(),
        });
        const service = createArchitectureQueryService(await analyzer.buildSnapshot({ version: 1 }));

        const hierarchy = service.view("hierarchy");
        const group = service.group("app");
        const search = service.search("launch");
        const launch = search.find((item) => item.qualifiedName === "createBootFlow::launch");
        expect(launch).toBeDefined();
        const neighborhood = service.neighborhood(launch!.id);

        expect(service.project()).toEqual(expect.objectContaining({ fileCount: 6, symbolCount: expect.any(Number) }));
        expect(hierarchy.nodes).not.toBe(service.view("hierarchy").nodes);
        expect(group?.groups[0]?.id).toBe("app");
        expect(search.map((item) => item.qualifiedName)).toContain("createBootFlow::launch");
        expect(neighborhood?.nodes.map((item) => item.id)).toContain(launch!.id);
        expect(neighborhood?.edges.length).toBeGreaterThan(0);

        const mutableNodes = hierarchy.nodes as unknown as unknown[];
        mutableNodes.length = 0;
        expect(service.view("hierarchy").nodes.length).toBeGreaterThan(0);
    });

    test("query service copies nested evidence arrays from non-frozen snapshots", () => {
        const snapshot = mutableSnapshot();
        const service = createArchitectureQueryService(snapshot);
        const first = service.view("calls");
        const evidence = first.nodes[0]?.evidence;
        expect(evidence).toBeDefined();

        const mutableEvidence = evidence as unknown as unknown[];
        mutableEvidence.length = 0;
        const mutableLocation = first.edges[0]?.evidence?.[0]?.location as { filePath: string } | undefined;
        expect(mutableLocation).toBeDefined();
        mutableLocation!.filePath = "changed.ts";

        expect(service.view("calls").nodes[0]?.evidence).toHaveLength(1);
        expect(service.view("calls").edges[0]?.evidence?.[0]?.location?.filePath).toBe("src/a.ts");
    });
});

function isDeepFrozen(value: unknown): boolean {
    if (typeof value !== "object" || value === null) return true;
    if (!Object.isFrozen(value)) return false;
    return Object.values(value).every(isDeepFrozen);
}

function stableSnapshot(snapshot: GraphSnapshot): string {
    return JSON.stringify(snapshot);
}

function mutableSnapshot(): GraphSnapshot {
    const calls = {
        type: "calls" as const,
        nodes: [{
            id: "a",
            kind: "function",
            label: "launch",
            qualifiedName: "createBootFlow::launch",
            evidence: [{ source: "fixture", location: { filePath: "src/a.ts", line: 1 } }],
        }],
        edges: [{
            id: "a:b:calls",
            from: "a",
            to: "b",
            relation: "calls",
            evidence: [{ source: "fixture", location: { filePath: "src/a.ts", line: 1 } }],
        }],
        groups: [],
        diagnostics: [],
    };
    const empty = (type: ViewType) => ({ type, nodes: [], edges: [], groups: [], diagnostics: [] });
    return {
        version: 1,
        generatedAt: 1,
        project: {},
        views: {
            hierarchy: empty("hierarchy"),
            startup: empty("startup"),
            dependencies: empty("dependencies"),
            "data-flow": empty("data-flow"),
            calls,
            resources: empty("resources"),
        },
        diagnostics: [],
    };
}
