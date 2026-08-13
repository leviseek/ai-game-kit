import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { createAnalysisScheduler } from "../lib/server/scheduler";
import { watchProject, type WatchBackend } from "../lib/server/watcher";
import { createGraphSnapshotStore } from "../lib/server/snapshot-store";
import { deferred, FakeClock, flushAsync, readyStatus, snapshot } from "./helpers/watcher-fixtures";

describe("createAnalysisScheduler", () => {
    test("debounces three triggers into one analysis", async () => {
        const clock = new FakeClock();
        const calls: string[] = [];
        const store = createGraphSnapshotStore();
        const scheduler = createAnalysisScheduler({
            sync: async () => {
                calls.push("sync");
            },
            status: async () => readyStatus(),
            analyze: async (input) => snapshot(input.version),
            store,
            debounceMs: 10,
            setTimeout: clock.setTimeout,
            clearTimeout: clock.clearTimeout,
        });

        scheduler.trigger();
        scheduler.trigger();
        scheduler.trigger();

        expect(clock.pending()).toBe(1);
        await clock.runNext();

        expect(calls).toEqual(["sync"]);
        expect(store.current().snapshot?.version).toBe(1);
    });

    test("coalesces changes during analysis into one follow-up", async () => {
        const clock = new FakeClock();
        const store = createGraphSnapshotStore();
        const blockers = [deferred<GraphSnapshot>(), deferred<GraphSnapshot>()];
        const versions: number[] = [];
        const scheduler = createAnalysisScheduler({
            sync: async () => {},
            status: async () => readyStatus(),
            analyze: async (input) => {
                versions.push(input.version);
                return blockers[versions.length - 1]!.promise;
            },
            store,
            debounceMs: 10,
            setTimeout: clock.setTimeout,
            clearTimeout: clock.clearTimeout,
        });

        scheduler.trigger();
        await clock.runNext();
        scheduler.trigger();
        scheduler.trigger();
        blockers[0]!.resolve(snapshot(1));
        await flushAsync();

        expect(versions).toEqual([1, 2]);
        blockers[1]!.resolve(snapshot(2));
        await flushAsync();
        expect(store.current().snapshot?.version).toBe(2);
    });

    test("sync failure enters index-waiting and does not analyze", async () => {
        const clock = new FakeClock();
        const store = createGraphSnapshotStore();
        let analyzeCount = 0;
        const scheduler = createAnalysisScheduler({
            sync: async () => {
                throw new Error("sync failed");
            },
            status: async () => readyStatus(),
            analyze: async (input) => {
                analyzeCount += 1;
                return snapshot(input.version);
            },
            store,
            debounceMs: 10,
            setTimeout: clock.setTimeout,
            clearTimeout: clock.clearTimeout,
        });

        scheduler.trigger();
        await clock.runNext();

        expect(analyzeCount).toBe(0);
        expect(store.current().state).toBe("index-waiting");
    });

    test("sync failure without status still does not analyze", async () => {
        const clock = new FakeClock();
        const store = createGraphSnapshotStore();
        let analyzeCount = 0;
        const events: unknown[] = [];
        store.subscribe((event) => events.push(event));
        const scheduler = createAnalysisScheduler({
            sync: async () => {
                throw new Error("sync failed");
            },
            analyze: async (input) => {
                analyzeCount += 1;
                return snapshot(input.version);
            },
            store,
            debounceMs: 10,
            setTimeout: clock.setTimeout,
            clearTimeout: clock.clearTimeout,
        });

        scheduler.trigger();
        await clock.runNext();

        expect(analyzeCount).toBe(0);
        expect(store.current().state).toBe("index-waiting");
        expect(events).toEqual([{ type: "state-changed", state: "index-waiting", generation: 1 }]);
    });

    test("status failure enters index-waiting and does not analyze", async () => {
        const clock = new FakeClock();
        const store = createGraphSnapshotStore();
        let analyzeCount = 0;
        const scheduler = createAnalysisScheduler({
            sync: async () => {},
            status: async () => {
                throw new Error("status failed");
            },
            analyze: async (input) => {
                analyzeCount += 1;
                return snapshot(input.version);
            },
            store,
            debounceMs: 10,
            setTimeout: clock.setTimeout,
            clearTimeout: clock.clearTimeout,
        });

        scheduler.trigger();
        await clock.runNext();

        expect(analyzeCount).toBe(0);
        expect(store.current().state).toBe("index-waiting");
    });

    test("pendingChanges keeps scheduler in index-waiting and does not analyze", async () => {
        const clock = new FakeClock();
        const store = createGraphSnapshotStore();
        let analyzeCount = 0;
        const scheduler = createAnalysisScheduler({
            sync: async () => {},
            status: async () => readyStatus({ added: 0, modified: 1, removed: 0 }),
            analyze: async (input) => {
                analyzeCount += 1;
                return snapshot(input.version);
            },
            store,
            debounceMs: 10,
            setTimeout: clock.setTimeout,
            clearTimeout: clock.clearTimeout,
        });

        scheduler.trigger();
        await clock.runNext();

        expect(analyzeCount).toBe(0);
        expect(store.current().state).toBe("index-waiting");
    });

    test("missing pendingChanges keeps scheduler in index-waiting and does not analyze", async () => {
        const clock = new FakeClock();
        const store = createGraphSnapshotStore();
        let analyzeCount = 0;
        const scheduler = createAnalysisScheduler({
            sync: async () => {},
            status: async () => {
                const { pendingChanges: _pendingChanges, ...status } = readyStatus();
                return status;
            },
            analyze: async (input) => {
                analyzeCount += 1;
                return snapshot(input.version);
            },
            store,
            debounceMs: 10,
            setTimeout: clock.setTimeout,
            clearTimeout: clock.clearTimeout,
        });

        scheduler.trigger();
        await clock.runNext();

        expect(analyzeCount).toBe(0);
        expect(store.current().state).toBe("index-waiting");
    });

    test("dispose prevents pending and future work", async () => {
        const clock = new FakeClock();
        const store = createGraphSnapshotStore();
        let syncCount = 0;
        const scheduler = createAnalysisScheduler({
            sync: async () => {
                syncCount += 1;
            },
            status: async () => readyStatus(),
            analyze: async (input) => snapshot(input.version),
            store,
            debounceMs: 10,
            setTimeout: clock.setTimeout,
            clearTimeout: clock.clearTimeout,
        });

        scheduler.trigger();
        scheduler.dispose();
        await clock.runAll();
        scheduler.trigger();
        await clock.runAll();

        expect(syncCount).toBe(0);
    });
});

describe("watchProject", () => {
    test("watches target directories and filters ignored changes", () => {
        const watched: string[] = [];
        const listeners: Array<(event: string, filename: string | Buffer | null) => void> = [];
        const disposed: string[] = [];
        const backend: WatchBackend = {
            watch(path, listener) {
                watched.push(path);
                listeners.push(listener);
                return { dispose: () => disposed.push(path) };
            },
        };
        const root = "D:/repo";
        const changes: string[] = [];
        const watcher = watchProject(root, (path) => changes.push(path), { backend });

        expect(watched).toEqual([join(root, "assets"), join(root, "tools"), join(root, "doc", "architecture"), join(root, "doc", "decisions")]);

        listeners[0]!("change", "main.ts");
        listeners[1]!("change", "temp/cache.ts");
        listeners[1]!("change", ".codegraph/index.sqlite");
        listeners[1]!("change", "node_modules/pkg/index.ts");
        listeners[1]!("change", "third-party/pkg/index.ts");
        listeners[1]!("change", ".superpowers/notes.md");
        listeners[2]!("change", "overview.md.meta");
        listeners[3]!("change", "adr.md");
        watcher.dispose();
        listeners[0]!("change", "later.ts");

        expect(changes).toEqual([join(root, "assets", "main.ts"), join(root, "doc", "decisions", "adr.md")]);
        expect(disposed).toEqual(watched);
    });
});
