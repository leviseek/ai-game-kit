import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { startArchServer } from "../lib/server/http-server";
import { createGraphSnapshotStore } from "../lib/server/snapshot-store";
import type { GraphSnapshot, GraphView, ViewType } from "../lib/graph/types";

const roots: string[] = [];
const viewTypes: readonly ViewType[] = ["hierarchy", "startup", "dependencies", "data-flow", "calls", "resources"];

afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("architecture workbench integration", () => {
    test("serves static workbench, six views, source and SSE while preserving the last successful snapshot", async () => {
        const fixture = createFixture();
        const store = createGraphSnapshotStore(snapshot(1));
        const server = await startArchServer({
            projectRoot: fixture.projectRoot,
            store,
            static: { webRoot: fixture.webRoot, compiledRoot: fixture.compiledRoot },
        });
        const controller = new AbortController();
        try {
            const index = await textFetch(`${server.url}/`);
            const app = await textFetch(`${server.url}/app.js`);
            const views = await Promise.all(viewTypes.map((viewType) => jsonFetch<GraphView>(`${server.url}/api/views/${viewType}`)));
            const source = await jsonFetch<{ readonly location: { readonly filePath: string; readonly line: number } }>(
                `${server.url}/api/source?file=src/entry.ts&line=1&radius=0`,
            );
            const failedGeneration = store.begin();
            expect(store.fail(failedGeneration, new Error("fixture analyzer failed"))).toBe(true);
            const projectAfterFailure = await jsonFetch<{ readonly version: number }>(`${server.url}/api/project`);
            const callsAfterFailure = await jsonFetch<GraphView>(`${server.url}/api/views/calls`);
            const events = await fetch(`${server.url}/api/events`, { signal: controller.signal });
            const reader = events.body?.getReader();
            expect(reader).toBeDefined();

            const generation = store.begin();
            expect(store.commit(generation, snapshot(2))).toBe(true);
            const eventText = await readUntil(reader!, 'data: {"type":"snapshot-ready","version":2');

            expect(index).toContain("Architecture Workbench");
            expect(app).toContain("fake analyzer app");
            expect(views.map((view) => view.type)).toEqual(viewTypes);
            expect(source.location).toEqual({ filePath: "src/entry.ts", line: 1 });
            expect(eventText).toContain("event: snapshot-ready");
            expect(eventText).toContain('"version":2');
            expect(projectAfterFailure.version).toBe(1);
            expect(callsAfterFailure.nodes).toEqual([expect.objectContaining({ qualifiedName: "createBootFlow::launch" })]);
            await reader!.cancel();
        } finally {
            controller.abort();
            await server.close();
        }
    });
});

async function textFetch(url: string): Promise<string> {
    const response = await fetch(url);
    expect(response.status).toBe(200);
    return response.text();
}

async function jsonFetch<T>(url: string): Promise<T> {
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    return response.json() as Promise<T>;
}

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, expected: string): Promise<string> {
    const decoder = new TextDecoder();
    let result = "";
    for (let index = 0; index < 10; index += 1) {
        const chunk = await reader.read();
        if (chunk.done) break;
        result += decoder.decode(chunk.value, { stream: true });
        if (result.includes(expected)) return result;
    }
    throw new Error(`SSE event not received: expected ${expected}; received ${result}`);
}

function createFixture(): Readonly<{ projectRoot: string; webRoot: string; compiledRoot: string }> {
    const root = mkdtempSync(join(tmpdir(), "arch-integration-"));
    roots.push(root);
    const projectRoot = join(root, "project");
    const webRoot = join(root, "web");
    const compiledRoot = join(root, "compiled");
    writeFile(projectRoot, "src/entry.ts", "export function launch() { return true; }\n");
    writeFile(webRoot, "index.html", "<!doctype html><title>Architecture Workbench</title><script src=\"./app.js\"></script>");
    writeFile(compiledRoot, "app.js", "export const marker = 'fake analyzer app';\n");
    return { projectRoot, webRoot, compiledRoot };
}

function writeFile(root: string, file: string, source: string): void {
    const fullPath = resolve(root, file);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, source);
}

function snapshot(version: number): GraphSnapshot {
    const views = Object.fromEntries(viewTypes.map((viewType) => [viewType, view(viewType)])) as Readonly<Record<ViewType, GraphView>>;
    return {
        version,
        generatedAt: version,
        project: { name: "fixture", version },
        views,
        diagnostics: [],
    };
}

function view(type: ViewType): GraphView {
    return {
        type,
        nodes: [{
            id: `${type}:launch`,
            kind: "function",
            label: "launch",
            qualifiedName: "createBootFlow::launch",
            location: { filePath: "src/entry.ts", line: 1 },
        }],
        edges: [],
        groups: [{ id: `${type}:root`, label: type, nodeIds: [`${type}:launch`] }],
        diagnostics: [],
    };
}
