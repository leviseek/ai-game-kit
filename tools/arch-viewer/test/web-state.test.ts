import { describe, expect, test } from "bun:test";

import { ArchApiClient, ArchApiError } from "../web/api";
import { connectSnapshotEvents } from "../web/events";
import { createWorkbenchState, reconcileSnapshot, reduceWorkbench } from "../web/state";
import type { WorkbenchState } from "../web/types";
import type { GraphView, ViewType } from "../lib/graph/types";

describe("workbench state", () => {
    test("切图保留可映射 selected id", () => {
        const state = createWorkbenchState(view("hierarchy", ["node:a", "node:b"]));
        const selected = reduceWorkbench(state, { type: "select-node", nodeId: "node:a" });

        const next = reduceWorkbench(selected, {
            type: "view-loaded",
            view: view("calls", ["node:a", "node:c"]),
            snapshotVersion: 2,
        });

        expect(next.viewType).toBe("calls");
        expect(next.selectedNodeId).toBe("node:a");
        expect(next.snapshotVersion).toBe(2);
    });

    test("新快照缺失焦点时沿 breadcrumb 退回最近 group", () => {
        const state: WorkbenchState = {
            ...createWorkbenchState(view("hierarchy", ["node:a", "node:b"], ["root", "feature"])),
            selectedNodeId: "node:missing",
            breadcrumbs: ["root", "feature", "leaf"],
        };

        const next = reconcileSnapshot(state, view("hierarchy", ["node:c"], ["root", "feature"]));

        expect(next.selectedNodeId).toBe("feature");
        expect(next.breadcrumbs).toEqual(["root", "feature"]);
        expect(next.status.kind).toBe("ready");
    });

    test("筛选与缩放状态不因 snapshot-ready 重置", () => {
        const state: WorkbenchState = {
            ...createWorkbenchState(view("dependencies", ["node:a"])),
            filters: { query: "boot", kinds: ["function"], relations: ["imports"], zoom: 1.8 },
            selectedNodeId: "node:a",
        };

        const next = reduceWorkbench(state, {
            type: "snapshot-ready",
            version: 7,
            view: view("dependencies", ["node:a", "node:b"]),
        });

        expect(next.filters).toEqual(state.filters);
        expect(next.selectedNodeId).toBe("node:a");
        expect(next.snapshotVersion).toBe(7);
        expect(next.status.kind).toBe("ready");
    });

    test("analysis-error 只更新 banner，不清空当前 graph/selection", () => {
        const state: WorkbenchState = {
            ...createWorkbenchState(view("calls", ["node:a"])),
            selectedNodeId: "node:a",
        };

        const next = reduceWorkbench(state, { type: "analysis-error", message: "scanner failed" });

        expect(next.currentView).toBe(state.currentView);
        expect(next.selectedNodeId).toBe("node:a");
        expect(next.status).toEqual({ kind: "error", message: "scanner failed" });
    });

    test("group 下钻追加 breadcrumb，返回已有 group 时截断路径", () => {
        const rootView = {
            ...view("hierarchy", [], ["repository", "assets", "framework"]),
            rootGroupId: "repository",
        };
        const root = createWorkbenchState(rootView);
        const assets = reduceWorkbench(root, {
            type: "group-loaded",
            groupId: "assets",
            view: view("hierarchy", [], ["assets", "framework"]),
        });
        const framework = reduceWorkbench(assets, {
            type: "group-loaded",
            groupId: "framework",
            view: view("hierarchy", [], ["framework"]),
        });
        const back = reduceWorkbench(framework, {
            type: "group-loaded",
            groupId: "assets",
            view: view("hierarchy", [], ["assets", "framework"]),
        });

        expect(assets.breadcrumbs).toEqual(["repository", "assets"]);
        expect(framework.breadcrumbs).toEqual(["repository", "assets", "framework"]);
        expect(back.breadcrumbs).toEqual(["repository", "assets"]);
        expect(back.selectedNodeId).toBe("assets");
    });
});

describe("ArchApiClient", () => {
    test("非 2xx 响应抛出包含 status/path 的 ArchApiError", async () => {
        const client = new ArchApiClient({
            baseUrl: "http://fixture",
            fetch: async () => new Response(JSON.stringify({ error: "not_found" }), { status: 404 }),
        });

        await expect(client.view("calls")).rejects.toMatchObject({
            name: "ArchApiError",
            status: 404,
            path: "/api/views/calls",
        });
        await expect(client.view("calls")).rejects.toBeInstanceOf(ArchApiError);
    });
});

describe("connectSnapshotEvents", () => {
    test("snapshot-ready 先 GET 当前 view 再 reconcile", async () => {
        const source = new FakeEventSource();
        const states: WorkbenchState[] = [];
        let state: WorkbenchState = {
            ...createWorkbenchState(view("calls", ["node:a"])),
            selectedNodeId: "node:missing",
            breadcrumbs: ["root"],
        };
        const client = new ArchApiClient({
            baseUrl: "http://fixture",
            fetch: async () => Response.json(view("calls", ["node:b"], ["root"])),
        });

        connectSnapshotEvents({
            state: () => state,
            client,
            EventSource: () => source,
            onState(next) {
                state = next;
                states.push(next);
            },
        });
        source.emit("snapshot-ready", { type: "snapshot-ready", version: 3, generation: 1 });
        await waitFor(() => states.length === 1);

        expect(states).toHaveLength(1);
        expect(state.snapshotVersion).toBe(3);
        expect(state.selectedNodeId).toBe("root");
        expect(state.currentView.nodes.map((node) => node.id)).toEqual(["node:b"]);
    });

    test("snapshot-ready GET 失败时不清空当前 graph", async () => {
        const source = new FakeEventSource();
        const current = createWorkbenchState(view("calls", ["node:a"]));
        let state = current;
        const client = new ArchApiClient({
            baseUrl: "http://fixture",
            fetch: async () => new Response("broken", { status: 503 }),
        });

        connectSnapshotEvents({
            state: () => state,
            client,
            EventSource: () => source,
            onState(next) {
                state = next;
            },
        });
        source.emit("snapshot-ready", { type: "snapshot-ready", version: 3, generation: 1 });
        await waitFor(() => state.status.kind === "error");

        expect(state.currentView).toBe(current.currentView);
        expect(state.status.kind).toBe("error");
    });
});

function view(type: ViewType, nodeIds: readonly string[], groupIds: readonly string[] = []): GraphView {
    return {
        type,
        nodes: nodeIds.map((id) => ({ id, kind: "symbol", label: id })),
        edges: [],
        groups: groupIds.map((id, index) => ({ id, label: id, parentId: groupIds[index - 1], nodeIds: [] })),
        diagnostics: [],
    };
}

class FakeEventSource {
    private readonly listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();
    public closed = false;

    public addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }

    public close(): void {
        this.closed = true;
    }

    public emit(type: string, data: unknown): void {
        for (const listener of this.listeners.get(type) ?? []) {
            listener(new MessageEvent(type, { data: JSON.stringify(data) }));
        }
    }
}

async function waitFor(predicate: () => boolean): Promise<void> {
    for (let index = 0; index < 10; index += 1) {
        if (predicate()) return;
        await Promise.resolve();
    }
}
