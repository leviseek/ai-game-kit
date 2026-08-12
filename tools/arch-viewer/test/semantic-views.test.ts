import { describe, expect, test } from "bun:test";

import { buildCallView } from "../lib/analysis/calls";
import { buildDataFlowView } from "../lib/analysis/data-flow";
import { buildResourceView } from "../lib/analysis/resources";
import { resolveConfiguredPath } from "../lib/analysis/semantic-path";
import { buildStartupView } from "../lib/analysis/startup";
import type { CodeGraphGateway } from "../lib/codegraph/gateway";
import type { CodeGraphNode, CodeGraphRelationNode } from "../lib/codegraph/types";
import {
    branch,
    defineArchitectureConfig,
    flow,
    group,
    lifecycle,
    phase,
    symbol,
} from "../lib/config/builders";
import type { Diagnostic } from "../lib/graph/types";

function node(qualifiedName: string, filePath: string, startLine: number): CodeGraphNode {
    const name = qualifiedName.split("::").at(-1) ?? qualifiedName;
    return {
        id: `node:${qualifiedName}`,
        kind: qualifiedName.includes("::") ? "method" : "function",
        name,
        qualifiedName,
        filePath,
        language: "typescript",
        startLine,
        endLine: startLine + 3,
        startColumn: 1,
        endColumn: 1,
        updatedAt: 1,
    };
}

function relation(value: CodeGraphNode): CodeGraphRelationNode {
    return {
        name: value.name,
        kind: value.kind,
        filePath: value.filePath,
        startLine: value.startLine,
    };
}

function makeGateway(nodes: readonly CodeGraphNode[]): CodeGraphGateway {
    const byQualifiedName = new Map(nodes.map((item) => [item.qualifiedName, item]));
    const edges = new Map<string, readonly string[]>([
        ["AppRoot::onLoad", ["assembleApp"]],
        ["assembleApp", ["createSceneFlow"]],
        ["createSceneFlow", ["createBootFlow"]],
        ["AppRoot::start", ["Application::start", "createBootFlow::launch"]],
        ["createBootFlow::launch", ["createSceneFlow::switchTo"]],
        ["createSceneFlow::switchTo", ["UiHost::init"]],
        ["projectCloseDialog", ["CloseDialog::onState"]],
        ["UiHost::loadPackage", ["UiHost::release"]],
        ["createSceneFlow::preload", ["createSceneFlow::switchTo"]],
        ["createSceneFlow::switchTo", ["createSceneFlow::currentFlowScope"]],
        ["StartFlow.test", ["Application::start"]],
    ]);
    const impacts = new Map<string, readonly string[]>([
        ["AppRoot::start", ["RuntimeProbe"]],
    ]);

    function resolveByName(name: string): CodeGraphNode | undefined {
        return byQualifiedName.get(name) ?? nodes.find((item) => item.name === name);
    }

    function related(symbolName: string, direction: "callers" | "callees"): readonly CodeGraphRelationNode[] {
        const matches: CodeGraphNode[] = [];
        if (direction === "callees") {
            for (const callee of edges.get(symbolName) ?? []) {
                const match = resolveByName(callee);
                if (match !== undefined) matches.push(match);
            }
        } else {
            for (const [caller, callees] of edges) {
                if (!callees.includes(symbolName)) continue;
                const match = resolveByName(caller);
                if (match !== undefined) matches.push(match);
            }
        }
        return matches.sort((left, right) => left.qualifiedName.localeCompare(right.qualifiedName)).map(relation);
    }

    return {
        status: async () => ({
            initialized: true,
            version: "fake",
            projectPath: "D:/repo",
            indexPath: "D:/repo/.codegraph",
            lastIndexed: null,
        }),
        sync: async () => {},
        files: async () => [],
        search: async (search) => nodes.filter((item) => item.qualifiedName.includes(search) || item.name === search),
        callers: async (symbolName) => related(symbolName, "callers"),
        callees: async (symbolName) => related(symbolName, "callees"),
        impact: async (symbolName) => (impacts.get(symbolName) ?? [])
            .map(resolveByName)
            .filter((item): item is CodeGraphNode => item !== undefined)
            .map(relation),
        resolveSymbol: async (ref) => {
            const matches = nodes.filter((item) =>
                (item.qualifiedName === ref.name || item.name === ref.name)
                && (ref.file === undefined || item.filePath === ref.file),
            );
            return matches[0] ?? {
                severity: "error",
                source: "codegraph",
                message: `Symbol "${ref.name}" was not found`,
            } satisfies Diagnostic;
        },
    };
}

const nodes = [
    node("AppRoot::onLoad", "assets/boot/AppRoot.ts", 10),
    node("assembleApp", "assets/boot/assembly.ts", 20),
    node("createSceneFlow", "assets/framework/core/scene/SceneFlow.ts", 30),
    node("createBootFlow", "assets/boot/flow/BootFlow.ts", 40),
    node("AppRoot::start", "assets/boot/AppRoot.ts", 50),
    node("Application::start", "assets/framework/application/Application.ts", 60),
    node("createBootFlow::launch", "assets/boot/flow/BootFlow.ts", 70),
    node("createSceneFlow::switchTo", "assets/framework/core/scene/SceneFlow.ts", 80),
    node("UiHost::init", "assets/boot/host/UiHost.ts", 90),
    node("CloseDialog::bind", "assets/samples/game_fui_demo/view/CloseDialog.ts", 100),
    node("CloseDialog::_handleConfirm", "assets/samples/game_fui_demo/view/CloseDialog.ts", 110),
    node("closeDialogReducer", "assets/samples/game_fui_demo/store.ts", 120),
    node("projectCloseDialog", "assets/samples/game_fui_demo/store.ts", 130),
    node("CloseDialog::onState", "assets/samples/game_fui_demo/view/CloseDialog.ts", 140),
    node("UiHost::loadPackage", "assets/boot/host/UiHost.ts", 150),
    node("UiHost::release", "assets/boot/host/UiHost.ts", 160),
    node("createSceneFlow::preload", "assets/framework/core/scene/SceneFlow.ts", 170),
    node("createSceneFlow::currentFlowScope", "assets/framework/core/scene/SceneFlow.ts", 180),
    node("StartFlow.test", "tools/arch-viewer/test/start-flow.test.ts", 190),
    node("RuntimeProbe", "assets/framework/diagnostics/RuntimeProbe.ts", 200),
] as const;

const config = defineArchitectureConfig({
    hierarchy: { root: group("repository", []) },
    dependencyRules: [],
    startup: {
        entry: symbol("AppRoot::onLoad", "assets/boot/AppRoot.ts"),
        phases: [phase("assembly", [
            symbol("assembleApp", "assets/boot/assembly.ts"),
            symbol("createSceneFlow", "assets/framework/core/scene/SceneFlow.ts"),
            symbol("createBootFlow", "assets/boot/flow/BootFlow.ts"),
        ])],
        branches: [
            branch("application", symbol("AppRoot::start", "assets/boot/AppRoot.ts"), [
                symbol("Application::start", "assets/framework/application/Application.ts"),
            ]),
            branch("presentation", symbol("AppRoot::start", "assets/boot/AppRoot.ts"), [
                symbol("createBootFlow::launch", "assets/boot/flow/BootFlow.ts"),
                symbol("createSceneFlow::switchTo", "assets/framework/core/scene/SceneFlow.ts"),
                symbol("UiHost::init", "assets/boot/host/UiHost.ts"),
            ]),
        ],
    },
    dataFlows: [flow("close-dialog", [
        { id: "view-input", anchors: [
            symbol("CloseDialog::bind", "assets/samples/game_fui_demo/view/CloseDialog.ts"),
            symbol("CloseDialog::_handleConfirm", "assets/samples/game_fui_demo/view/CloseDialog.ts"),
        ] },
        { id: "state", anchors: [symbol("closeDialogReducer", "assets/samples/game_fui_demo/store.ts")] },
        { id: "projection", anchors: [
            symbol("projectCloseDialog", "assets/samples/game_fui_demo/store.ts"),
            symbol("CloseDialog::onState", "assets/samples/game_fui_demo/view/CloseDialog.ts"),
        ] },
    ])],
    resources: [
        lifecycle("global-ui-package", [
            symbol("UiHost::loadPackage", "assets/boot/host/UiHost.ts"),
            symbol("UiHost::release", "assets/boot/host/UiHost.ts"),
        ]),
        lifecycle("scene-flow", [
            symbol("createSceneFlow::preload", "assets/framework/core/scene/SceneFlow.ts"),
            symbol("createSceneFlow::switchTo", "assets/framework/core/scene/SceneFlow.ts"),
            symbol("createSceneFlow::currentFlowScope", "assets/framework/core/scene/SceneFlow.ts"),
        ]),
    ],
});

describe("semantic views", () => {
    const gateway = makeGateway(nodes);

    test("resolves configured paths with code evidence or declared fallback", async () => {
        const result = await resolveConfiguredPath(gateway, [
            symbol("CloseDialog::_handleConfirm", "assets/samples/game_fui_demo/view/CloseDialog.ts"),
            symbol("closeDialogReducer", "assets/samples/game_fui_demo/store.ts"),
        ]);

        expect(result.edges[0]?.metadata).toEqual(expect.objectContaining({ declared: true }));
        expect(result.edges[0]?.evidence).toEqual([]);
        expect(result.diagnostics).toContainEqual(expect.objectContaining({
            severity: "warning",
            message: expect.stringContaining("No CodeGraph evidence"),
        }));
    });

    test("builds startup phases and branches without inventing cross-branch edges", async () => {
        const view = await buildStartupView(gateway, config.startup);
        const fakeEdge = view.edges.find((edge) =>
            edge.from === "node:Application::start" && edge.to === "node:createBootFlow::launch");

        expect(view.type).toBe("startup");
        expect(view.nodes.find((item) => item.qualifiedName === "assembleApp")?.metadata)
            .toEqual(expect.objectContaining({ phase: "assembly" }));
        expect(view.nodes.find((item) => item.qualifiedName === "Application::start")?.metadata)
            .toEqual(expect.objectContaining({ branch: "application" }));
        expect(view.nodes.find((item) => item.qualifiedName === "createBootFlow::launch")?.metadata)
            .toEqual(expect.objectContaining({ branch: "presentation" }));
        expect(fakeEdge).toBeUndefined();
        expect(view.edges.every((edge) => edge.evidence !== undefined)).toBe(true);
    });

    test("builds data flow lanes with direction metadata and declared UI-to-store edge", async () => {
        const [flowConfig] = config.dataFlows;
        const view = await buildDataFlowView(gateway, flowConfig!);
        const declaredEdge = view.edges.find((edge) =>
            edge.from === "node:CloseDialog::_handleConfirm" && edge.to === "node:closeDialogReducer");

        expect(view.type).toBe("data-flow");
        expect(view.nodes.find((item) => item.qualifiedName === "CloseDialog::bind")?.metadata)
            .toEqual(expect.objectContaining({ lane: "view-input", direction: "source" }));
        expect(view.nodes.find((item) => item.qualifiedName === "CloseDialog::onState")?.metadata)
            .toEqual(expect.objectContaining({ lane: "projection", direction: "sink" }));
        expect(declaredEdge?.metadata).toEqual(expect.objectContaining({ lane: "state", declared: true }));
        expect(view.edges.find((edge) => edge.to === "node:CloseDialog::onState")?.evidence).toHaveLength(1);
    });

    test("builds call view with incoming, outgoing, affected and test roles", async () => {
        const view = await buildCallView(gateway, [
            symbol("Application::start", "assets/framework/application/Application.ts"),
            symbol("AppRoot::start", "assets/boot/AppRoot.ts"),
        ]);

        expect(view.type).toBe("calls");
        expect(view.nodes.find((item) => item.qualifiedName === "StartFlow.test")?.metadata)
            .toEqual(expect.objectContaining({ role: "test" }));
        expect(view.nodes.find((item) => item.label === "launch")?.metadata)
            .toEqual(expect.objectContaining({ role: "outgoing" }));
        expect(view.nodes.find((item) => item.qualifiedName === "RuntimeProbe")?.metadata)
            .toEqual(expect.objectContaining({ role: "affected" }));
        expect(view.nodes.find((item) => item.qualifiedName === "Application::start")?.metadata)
            .toEqual(expect.objectContaining({ role: "incoming" }));
    });

    test("builds resource lifecycle levels with owner, scope and state", async () => {
        const view = await buildResourceView(gateway, config.resources);

        expect(view.type).toBe("resources");
        expect(view.nodes.find((item) => item.qualifiedName === "UiHost::loadPackage")?.metadata)
            .toEqual(expect.objectContaining({ level: 0, owner: "global-ui-package", scope: "global-ui-package", state: "enter" }));
        expect(view.nodes.find((item) => item.qualifiedName === "UiHost::release")?.metadata)
            .toEqual(expect.objectContaining({ level: 1, owner: "global-ui-package", scope: "global-ui-package", state: "exit" }));
        expect(view.nodes.find((item) => item.qualifiedName === "createSceneFlow::switchTo")?.metadata)
            .toEqual(expect.objectContaining({ owner: "scene-flow", scope: "scene-flow", state: "active" }));
    });
});
