import type { CodeGraphGateway } from "../../lib/codegraph/gateway";
import type { CodeGraphFile, CodeGraphNode, CodeGraphRelationNode } from "../../lib/codegraph/types";
import type { Diagnostic } from "../../lib/graph/types";

export interface CodeGraphFixture {
    readonly files: Readonly<Record<string, string>>;
    readonly nodes: readonly CodeGraphNode[];
    readonly edges: Readonly<Record<string, readonly string[]>>;
    readonly impacts: Readonly<Record<string, readonly string[]>>;
}

export const codeGraphFixture: CodeGraphFixture = {
    files: {
        "src/app.ts": [
            'import { assembleApp } from "./assembly";',
            'import { createBootFlow } from "./boot";',
            "export class AppRoot {",
            "    onLoad(): void { assembleApp(); }",
            "    start(): void { createBootFlow().launch(); }",
            "}",
            "",
        ].join("\n"),
        "src/assembly.ts": [
            'import { createSceneFlow } from "./scene";',
            'import { createBootFlow } from "./boot";',
            "export function assembleApp(): void { createSceneFlow(); createBootFlow(); }",
            "",
        ].join("\n"),
        "src/boot.ts": ['import { createSceneFlow } from "./scene";', "export function createBootFlow() {", "    return { launch(): void { createSceneFlow().switchTo(); } };", "}", ""].join("\n"),
        "src/scene.ts": ["export function createSceneFlow() {", "    return { preload(): void {}, switchTo(): void {}, currentFlowScope(): void {} };", "}", ""].join("\n"),
        "src/store.ts": ["export function closeDialogReducer(): void {}", "export function projectCloseDialog(): void { onState(); }", "export function onState(): void {}", ""].join("\n"),
        "src/ui.ts": [
            "export class CloseDialog {",
            "    bind(): void {}",
            "    _handleConfirm(): void { closeDialogReducer(); }",
            "    onState(): void {}",
            "}",
            "export class UiHost {",
            "    init(): void {}",
            "    loadPackage(): void { this.release(); }",
            "    release(): void {}",
            "}",
            "declare function closeDialogReducer(): void;",
            "",
        ].join("\n"),
    },
    nodes: [
        node("AppRoot::onLoad", "src/app.ts", 4, "method"),
        node("AppRoot::start", "src/app.ts", 5, "method"),
        node("assembleApp", "src/assembly.ts", 3, "function"),
        node("createBootFlow", "src/boot.ts", 2, "function"),
        node("createBootFlow::launch", "src/boot.ts", 3, "method"),
        node("createSceneFlow", "src/scene.ts", 1, "function"),
        node("createSceneFlow::preload", "src/scene.ts", 2, "method"),
        node("createSceneFlow::switchTo", "src/scene.ts", 2, "method"),
        node("createSceneFlow::currentFlowScope", "src/scene.ts", 2, "method"),
        node("CloseDialog::bind", "src/ui.ts", 2, "method"),
        node("CloseDialog::_handleConfirm", "src/ui.ts", 3, "method"),
        node("CloseDialog::onState", "src/ui.ts", 4, "method"),
        node("UiHost::init", "src/ui.ts", 7, "method"),
        node("UiHost::loadPackage", "src/ui.ts", 8, "method"),
        node("UiHost::release", "src/ui.ts", 9, "method"),
        node("closeDialogReducer", "src/store.ts", 1, "function"),
        node("projectCloseDialog", "src/store.ts", 2, "function"),
    ],
    edges: {
        "AppRoot::onLoad": ["assembleApp"],
        "AppRoot::start": ["createBootFlow::launch"],
        assembleApp: ["createSceneFlow", "createBootFlow"],
        "createBootFlow::launch": ["createSceneFlow::switchTo"],
        "createSceneFlow::preload": ["createSceneFlow::switchTo"],
        "createSceneFlow::switchTo": ["createSceneFlow::currentFlowScope", "UiHost::init"],
        "CloseDialog::_handleConfirm": ["closeDialogReducer"],
        projectCloseDialog: ["CloseDialog::onState"],
        "UiHost::loadPackage": ["UiHost::release"],
    },
    impacts: {
        "createBootFlow::launch": ["UiHost::init"],
    },
};

export function createFixtureGateway(fixture = codeGraphFixture): CodeGraphGateway {
    const nodes = fixture.nodes;
    const byQualifiedName = new Map(nodes.map((item) => [item.qualifiedName, item]));

    function resolveByName(name: string): CodeGraphNode | undefined {
        return byQualifiedName.get(name) ?? nodes.find((item) => item.name === name);
    }

    function relation(item: CodeGraphNode): CodeGraphRelationNode {
        return { name: item.qualifiedName, kind: item.kind, filePath: item.filePath, startLine: item.startLine };
    }

    function related(symbolName: string, direction: "callers" | "callees"): readonly CodeGraphRelationNode[] {
        const matches: CodeGraphNode[] = [];
        if (direction === "callees") {
            for (const callee of fixture.edges[symbolName] ?? []) {
                const match = resolveByName(callee);
                if (match !== undefined) matches.push(match);
            }
        } else {
            for (const [caller, callees] of Object.entries(fixture.edges)) {
                if (!callees.includes(symbolName)) continue;
                const match = resolveByName(caller);
                if (match !== undefined) matches.push(match);
            }
        }
        return matches.sort(compareNodes).map(relation);
    }

    return {
        status: async () => ({
            initialized: true,
            version: "fake",
            projectPath: "D:/fixture",
            indexPath: "D:/fixture/.codegraph",
            lastIndexed: null,
        }),
        sync: async () => {},
        files: async () =>
            Object.keys(fixture.files)
                .sort()
                .map((path): CodeGraphFile => ({
                    path,
                    language: "typescript",
                    nodeCount: fixture.nodes.filter((item) => item.filePath === path).length,
                    size: fixture.files[path]?.length ?? 0,
                })),
        search: async (search) => nodes.filter((item) => item.qualifiedName.includes(search) || item.name === search),
        callers: async (symbolName) => related(symbolName, "callers"),
        callees: async (symbolName) => related(symbolName, "callees"),
        impact: async (symbolName) =>
            (fixture.impacts[symbolName] ?? [])
                .map(resolveByName)
                .filter((item): item is CodeGraphNode => item !== undefined)
                .sort(compareNodes)
                .map(relation),
        resolveSymbol: async (ref) => {
            const matches = nodes.filter((item) => (item.qualifiedName === ref.name || item.name === ref.name) && (ref.file === undefined || item.filePath === ref.file));
            return (
                matches[0] ??
                ({
                    severity: "error",
                    source: "codegraph",
                    message: `Symbol "${ref.name}" was not found`,
                } satisfies Diagnostic)
            );
        },
    };
}

function node(qualifiedName: string, filePath: string, startLine: number, kind: CodeGraphNode["kind"]): CodeGraphNode {
    const name = qualifiedName.split("::").at(-1) ?? qualifiedName;
    return {
        id: `node:${qualifiedName}`,
        kind,
        name,
        qualifiedName,
        filePath,
        language: "typescript",
        startLine,
        endLine: startLine,
        startColumn: 1,
        endColumn: 1,
        updatedAt: 1,
    };
}

function compareNodes(left: CodeGraphNode, right: CodeGraphNode): number {
    return left.qualifiedName.localeCompare(right.qualifiedName) || left.filePath.localeCompare(right.filePath) || left.startLine - right.startLine;
}
