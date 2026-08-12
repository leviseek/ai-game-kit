import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { startArchServer } from "../lib/server/http-server";
import { readSourceExcerpt } from "../lib/server/source";
import { createGraphSnapshotStore } from "../lib/server/snapshot-store";
import type { GraphSnapshot, ViewType } from "../lib/graph/types";

const roots: string[] = [];

afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("startArchServer", () => {
    test("serves project, views, search and 404 JSON", async () => {
        const root = createFixtureRoot();
        const server = await startArchServer({ projectRoot: root, store: createGraphSnapshotStore(snapshot()) });
        try {
            const project = await jsonFetch(`${server.url}/api/project`);
            const view = await jsonFetch(`${server.url}/api/views/calls`);
            const search = await jsonFetch(`${server.url}/api/symbols/search?q=launch`);
            const missing = await fetch(`${server.url}/api/views/unknown`);

            expect(project.headers.get("content-type")).toBe("application/json; charset=utf-8");
            expect(await project.json()).toEqual({ name: "fixture", fileCount: 2 });
            expect(await view.json()).toEqual(expect.objectContaining({ type: "calls", nodes: expect.any(Array) }));
            expect(await search.json()).toEqual([expect.objectContaining({ qualifiedName: "createBootFlow::launch" })]);
            expect(missing.status).toBe(404);
            expect(missing.headers.get("content-type")).toBe("application/json; charset=utf-8");
            expect(await missing.json()).toEqual({ error: "not_found" });
        } finally {
            await server.close();
        }
    });

    test("serves groups, neighborhoods and validated source excerpts", async () => {
        const root = createFixtureRoot();
        const server = await startArchServer({ projectRoot: root, store: createGraphSnapshotStore(snapshot()) });
        try {
            const group = await jsonFetch(`${server.url}/api/groups/entry`);
            const neighborhood = await jsonFetch(`${server.url}/api/nodes/symbol:launch/neighborhood`);
            const source = await jsonFetch(`${server.url}/api/source?file=src/large.ts&line=60&radius=100`);

            expect(await group.json()).toEqual(expect.objectContaining({ rootGroupId: "entry" }));
            expect(await neighborhood.json()).toEqual(expect.objectContaining({ nodes: [expect.objectContaining({ id: "symbol:launch" })] }));
            expect(await source.json()).toEqual(expect.objectContaining({
                location: { filePath: "src/large.ts", line: 60 },
                startLine: 20,
                endLine: 99,
                lines: expect.arrayContaining([expect.objectContaining({ number: 60, text: "export const line60 = 60;" })]),
            }));
        } finally {
            await server.close();
        }
    });

    test("rejects path traversal and repository-external absolute paths", async () => {
        const root = createFixtureRoot();
        const externalRoot = createFixtureRoot();
        const externalFile = resolve(externalRoot, "outside.ts");
        writeFileSync(externalFile, "export const outside = true;\n");
        const server = await startArchServer({ projectRoot: root, store: createGraphSnapshotStore(snapshot()) });
        try {
            const traversal = await fetch(`${server.url}/api/source?file=../package.json&line=1`);
            const external = await fetch(`${server.url}/api/source?file=${encodeURIComponent(externalFile)}&line=1`);

            expect(traversal.status).toBe(403);
            expect(external.status).toBe(403);
            expect(await traversal.json()).toEqual({ error: "forbidden" });
            expect(JSON.stringify(await external.json())).not.toContain(externalRoot);
        } finally {
            await server.close();
        }
    });

    test("streams snapshot-ready events over SSE and releases on close", async () => {
        const root = createFixtureRoot();
        const store = createGraphSnapshotStore(snapshot());
        const server = await startArchServer({ projectRoot: root, store });
        const controller = new AbortController();
        try {
            const response = await fetch(`${server.url}/api/events`, { signal: controller.signal });
            expect(response.headers.get("content-type")).toBe("text/event-stream");
            const reader = response.body?.getReader();
            expect(reader).toBeDefined();

            const generation = store.begin();
            expect(store.commit(generation, snapshot(2))).toBe(true);
            const chunk = await readUntil(reader!, "event: snapshot-ready");

            expect(chunk).toContain("event: snapshot-ready");
            expect(chunk).toContain('data: {"type":"snapshot-ready","version":2');
            await reader!.cancel();
        } finally {
            controller.abort();
            await server.close();
        }
    });
});

describe("readSourceExcerpt", () => {
    test("returns at most 80 source lines from a repository-local path", async () => {
        const root = createFixtureRoot();

        const excerpt = await readSourceExcerpt(root, "src/large.ts", 60, 100);

        expect(excerpt.location).toEqual({ filePath: "src/large.ts", line: 60 });
        expect(excerpt.lines).toHaveLength(80);
        expect(excerpt.startLine).toBe(20);
        expect(excerpt.endLine).toBe(99);
    });
});

async function jsonFetch(url: string): Promise<Response> {
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    return response;
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
    return result;
}

function createFixtureRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "arch-http-"));
    roots.push(root);
    writeFixtureFile(root, "src/entry.ts", "export function launch() { return true; }\n");
    writeFixtureFile(root, "src/large.ts", Array.from({ length: 120 }, (_, index) => `export const line${index + 1} = ${index + 1};`).join("\n"));
    return root;
}

function writeFixtureFile(root: string, file: string, source: string): void {
    const fullPath = join(root, file);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, source);
}

function snapshot(version = 1): GraphSnapshot {
    const calls = {
        type: "calls" as const,
        nodes: [{
            id: "symbol:launch",
            kind: "function",
            label: "launch",
            qualifiedName: "createBootFlow::launch",
            location: { filePath: "src/entry.ts", line: 1 },
        }],
        edges: [{ id: "symbol:launch:self", from: "symbol:launch", to: "symbol:launch", relation: "calls" }],
        groups: [{ id: "entry", label: "Entry", nodeIds: ["symbol:launch"] }],
        diagnostics: [],
    };
    const empty = (type: ViewType) => ({ type, nodes: [], edges: [], groups: [], diagnostics: [] });
    return {
        version,
        generatedAt: version,
        project: { name: "fixture", fileCount: 2 },
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
