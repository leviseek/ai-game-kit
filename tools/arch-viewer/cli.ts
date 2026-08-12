import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

import architectureConfig from "./architecture.config";
import { archUsage, parseArchArgs } from "./lib/args";
import { ArchitectureAnalyzer } from "./lib/analysis/analyzer";
import { createCodeGraphGateway } from "./lib/codegraph/gateway";
import type { CodeGraphStatus } from "./lib/codegraph/types";
import type { GraphSnapshot } from "./lib/graph/types";
import { openBrowser } from "./lib/server/open-browser";
import type { WatchHandle } from "./lib/server/watcher";
import { watchProject } from "./lib/server/watcher";
import { createAnalysisScheduler } from "./lib/server/scheduler";
import { createGraphSnapshotStore } from "./lib/server/snapshot-store";
import { startArchServer } from "./lib/server/http-server";

export interface ArchServerSession {
    readonly url: string;
    createWatcher?(): WatchHandle;
    dispose(): Promise<void>;
}

export interface ArchRunDeps {
    readonly buildWeb: () => Promise<void>;
    readonly analyzeOnce: () => Promise<GraphSnapshot>;
    readonly startServer: (port: number | undefined) => Promise<ArchServerSession>;
    readonly startWatcher: (server: ArchServerSession) => WatchHandle;
    readonly openBrowser: (url: string) => Promise<void>;
    readonly waitForShutdown: (server: ArchServerSession, watcher: WatchHandle) => Promise<void>;
    readonly writeOut: (line: string) => void;
    readonly writeErr: (line: string) => void;
}

const projectRoot = resolve(import.meta.dirname, "../..");
const webRoot = join(import.meta.dirname, "web");
const compiledRoot = join(projectRoot, "temp", "arch-viewer", "web");

export async function run(argv: readonly string[], deps: ArchRunDeps = productionDeps): Promise<number> {
    const parsed = parseArchArgs(argv);
    if (!parsed.ok) {
        deps.writeErr(parsed.message);
        return 2;
    }
    if (parsed.options.help) {
        deps.writeOut(archUsage());
        return 0;
    }

    try {
        if (parsed.options.once) {
            const snapshot = await deps.analyzeOnce();
            deps.writeOut(snapshotSummary(snapshot));
            return 0;
        }

        await deps.buildWeb();
        const server = await deps.startServer(parsed.options.port);
        let watcher: WatchHandle | undefined;
        try {
            watcher = deps.startWatcher(server);
            if (parsed.options.open) await deps.openBrowser(server.url);
            await deps.waitForShutdown(server, watcher);
        } catch (error) {
            watcher?.dispose();
            await server.dispose();
            throw error;
        }
        return 0;
    } catch (error) {
        deps.writeErr(error instanceof Error ? error.message : String(error));
        return 1;
    }
}

const productionDeps: ArchRunDeps = {
    buildWeb: () => runProcess("bun", ["x", "tsc", "-p", "tools/arch-viewer/tsconfig.web.json"]),
    analyzeOnce: async () => {
        const gateway = createCodeGraphGateway({ projectRoot });
        await gateway.sync();
        const status = await gateway.status();
        assertCodeGraphReady(status);
        return new ArchitectureAnalyzer({ projectRoot, config: architectureConfig, gateway }).buildSnapshot({ version: 1 });
    },
    startServer: async (port) => {
        const gateway = createCodeGraphGateway({ projectRoot });
        await gateway.sync();
        const status = await gateway.status();
        assertCodeGraphReady(status);
        const analyzer = new ArchitectureAnalyzer({ projectRoot, config: architectureConfig, gateway });
        const initialSnapshot = await analyzer.buildSnapshot({ version: 1 });
        const store = createGraphSnapshotStore(initialSnapshot);
        const server = await startArchServer({ projectRoot, store, port, static: { webRoot, compiledRoot } });
        const scheduler = createAnalysisScheduler({
            sync: gateway.sync,
            status: gateway.status,
            analyze: (input) => analyzer.buildSnapshot(input),
            store,
            debounceMs: 250,
        });
        return {
            url: server.url,
            createWatcher: () => {
                const watcher = watchProject(projectRoot, () => scheduler.trigger());
                return {
                    dispose() {
                        watcher.dispose();
                        scheduler.dispose();
                    },
                };
            },
            dispose: async () => {
                scheduler.dispose();
                await server.close();
            },
        };
    },
    startWatcher: (server) => server.createWatcher?.() ?? { dispose() {} },
    openBrowser: (url) => openBrowser(url, { writeErr: (line) => console.warn(line) }),
    waitForShutdown: waitForSignal,
    writeOut: (line) => console.log(line),
    writeErr: (line) => console.error(line),
};

function snapshotSummary(snapshot: GraphSnapshot): string {
    return `views=${Object.keys(snapshot.views).length} diagnostics=${snapshot.diagnostics.length}`;
}

export function assertCodeGraphReady(status: CodeGraphStatus): void {
    const pending = status.pendingChanges;
    if (pending === undefined) {
        throw new Error("CodeGraph index readiness cannot be verified: missing pendingChanges");
    }
    if (pending.added !== 0 || pending.modified !== 0 || pending.removed !== 0) {
        throw new Error(`CodeGraph index has pending changes: added=${pending.added} modified=${pending.modified} removed=${pending.removed}`);
    }
    const mismatch = status.worktreeMismatch;
    if (mismatch !== undefined && mismatch !== null) {
        throw new Error(`CodeGraph worktree mismatch: indexRoot=${mismatch.indexRoot} worktreeRoot=${mismatch.worktreeRoot}`);
    }
}

async function runProcess(command: string, args: readonly string[]): Promise<void> {
    await new Promise<void>((resolveProcess, rejectProcess) => {
        const child = spawn(command, args, { stdio: "inherit", shell: false, cwd: projectRoot });
        child.once("error", rejectProcess);
        child.once("exit", (code) => {
            if (code === 0) resolveProcess();
            else rejectProcess(new Error(`${command} ${args.join(" ")} exited with ${code ?? "signal"}`));
        });
    });
}

async function waitForSignal(server: ArchServerSession, watcher: WatchHandle): Promise<void> {
    await new Promise<void>((resolveSignal) => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            process.off("SIGINT", finish);
            process.off("SIGTERM", finish);
            watcher.dispose();
            resolveSignal();
        };
        process.once("SIGINT", finish);
        process.once("SIGTERM", finish);
    });
    await server.dispose();
}

if (import.meta.main) {
    process.exit(await run(process.argv.slice(2)));
}
