import { describe, expect, test } from "bun:test";

import { assertCodeGraphReady, run, type ArchRunDeps } from "../cli";
import type { CodeGraphStatus } from "../lib/codegraph/types";
import type { GraphSnapshot, ViewType } from "../lib/graph/types";
import { resolveBrowserCommand } from "../lib/server/open-browser";

describe("arch CLI", () => {
    test("--help prints usage without starting services", async () => {
        const calls: string[] = [];
        const out: string[] = [];
        const code = await run(["--help"], deps(calls, out));

        expect(code).toBe(0);
        expect(out.join("\n")).toContain("arch [--port <number>] [--no-open] [--once]");
        expect(calls).toEqual([]);
    });

    test("--once --no-open analyzes and prints a six-view summary", async () => {
        const calls: string[] = [];
        const out: string[] = [];
        const code = await run(["--once", "--no-open"], deps(calls, out, snapshot(3)));

        expect(code).toBe(0);
        expect(calls).toEqual(["analyzeOnce"]);
        expect(out).toEqual(["views=6 diagnostics=3"]);
    });

    test("default mode builds web, starts server, watcher, then opens URL", async () => {
        const calls: string[] = [];
        const code = await run(["--port", "4567"], deps(calls, [], snapshot()));

        expect(code).toBe(0);
        expect(calls).toEqual([
            "buildWeb",
            "startServer:4567",
            "startWatcher",
            "openBrowser:http://127.0.0.1:4567",
            "waitForShutdown:http://127.0.0.1:4567",
        ]);
    });

    test("--no-open skips opening the browser", async () => {
        const calls: string[] = [];
        const code = await run(["--no-open"], deps(calls, [], snapshot()));

        expect(code).toBe(0);
        expect(calls).toEqual([
            "buildWeb",
            "startServer:0",
            "startWatcher",
            "waitForShutdown:http://127.0.0.1:1234",
        ]);
    });

    test("default mode disposes server when watcher startup fails", async () => {
        const calls: string[] = [];
        const err: string[] = [];
        const code = await run(["--no-open"], {
            ...deps(calls, [], snapshot(), err),
            startWatcher: () => {
                calls.push("startWatcher");
                throw new Error("watcher failed");
            },
        });

        expect(code).toBe(1);
        expect(calls).toEqual(["buildWeb", "startServer:0", "startWatcher", "server.dispose"]);
        expect(err).toEqual(["watcher failed"]);
    });

    test("CodeGraph status without pendingChanges is not ready", () => {
        const { pendingChanges: _pendingChanges, ...status } = readyStatus();

        expect(() => assertCodeGraphReady(status)).toThrow("CodeGraph index readiness cannot be verified: missing pendingChanges");
    });

    test("--once returns 1 when initial analysis reports CodeGraph not ready", async () => {
        const calls: string[] = [];
        const err: string[] = [];
        const code = await run(["--once", "--no-open"], {
            ...deps(calls, [], snapshot(), err),
            analyzeOnce: async () => {
                calls.push("analyzeOnce");
                throw new Error("CodeGraph index readiness cannot be verified: missing pendingChanges");
            },
        });

        expect(code).toBe(1);
        expect(calls).toEqual(["analyzeOnce"]);
        expect(err).toEqual(["CodeGraph index readiness cannot be verified: missing pendingChanges"]);
    });

    test("default mode returns 1 when server startup reports CodeGraph not ready", async () => {
        const calls: string[] = [];
        const err: string[] = [];
        const code = await run(["--no-open"], {
            ...deps(calls, [], snapshot(), err),
            startServer: async (port) => {
                calls.push(`startServer:${port ?? 0}`);
                throw new Error("CodeGraph index readiness cannot be verified: missing pendingChanges");
            },
        });

        expect(code).toBe(1);
        expect(calls).toEqual(["buildWeb", "startServer:0"]);
        expect(err).toEqual(["CodeGraph index readiness cannot be verified: missing pendingChanges"]);
    });

    test("invalid port returns 2", async () => {
        const calls: string[] = [];
        const err: string[] = [];
        const code = await run(["--port", "0"], deps(calls, [], snapshot(), err));

        expect(code).toBe(2);
        expect(calls).toEqual([]);
        expect(err.join("\n")).toContain("invalid port");
    });

    test("resolves platform browser commands", () => {
        expect(resolveBrowserCommand("win32", "http://127.0.0.1:1234")).toEqual({
            command: "cmd.exe",
            args: ["/c", "start", "", "http://127.0.0.1:1234"],
        });
        expect(resolveBrowserCommand("darwin", "http://127.0.0.1:1234")).toEqual({
            command: "open",
            args: ["http://127.0.0.1:1234"],
        });
        expect(resolveBrowserCommand("linux", "http://127.0.0.1:1234")).toEqual({
            command: "xdg-open",
            args: ["http://127.0.0.1:1234"],
        });
    });
});

function deps(calls: string[], out: string[], nextSnapshot = snapshot(), err: string[] = []): ArchRunDeps {
    return {
        buildWeb: async () => { calls.push("buildWeb"); },
        analyzeOnce: async () => {
            calls.push("analyzeOnce");
            return nextSnapshot;
        },
        startServer: async (port) => {
            calls.push(`startServer:${port ?? 0}`);
            const actualPort = port ?? 1234;
            return {
                url: `http://127.0.0.1:${actualPort}`,
                dispose: async () => { calls.push("server.dispose"); },
            };
        },
        startWatcher: () => {
            calls.push("startWatcher");
            return { dispose: () => { calls.push("watcher.dispose"); } };
        },
        openBrowser: async (url) => { calls.push(`openBrowser:${url}`); },
        waitForShutdown: async (server) => {
            calls.push(`waitForShutdown:${server.url}`);
        },
        writeOut: (line) => out.push(line),
        writeErr: (line) => err.push(line),
    };
}

function readyStatus(): CodeGraphStatus {
    return {
        initialized: true,
        version: "fake",
        projectPath: "D:/repo",
        indexPath: "D:/repo/.codegraph",
        lastIndexed: null,
        pendingChanges: { added: 0, modified: 0, removed: 0 },
    };
}

function snapshot(diagnosticCount = 0): GraphSnapshot {
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
            calls: empty("calls"),
            resources: empty("resources"),
        },
        diagnostics: Array.from({ length: diagnosticCount }, (_, index) => ({
            severity: "warning" as const,
            source: "test",
            message: `diagnostic ${index + 1}`,
        })),
    };
}
