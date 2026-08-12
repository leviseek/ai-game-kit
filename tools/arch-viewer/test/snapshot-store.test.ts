import { describe, expect, test } from "bun:test";

import { createGraphSnapshotStore } from "../lib/server/snapshot-store";
import type { GraphSnapshot, ViewType } from "../lib/graph/types";

describe("GraphSnapshotStore", () => {
    test("旧代次不能覆盖新快照，失败保留 last-known-good", () => {
        const store = createGraphSnapshotStore(snapshot(1));
        const old = store.begin();
        const latest = store.begin();

        expect(store.commit(old, snapshot(2))).toBe(false);
        expect(store.commit(latest, snapshot(3))).toBe(true);
        expect(store.fail(latest + 1, new Error("broken"))).toBe(false);
        expect(store.current().snapshot?.version).toBe(3);
        expect(store.current().state).toBe("idle");
    });

    test("失败广播 error 但不清空 last-known-good", () => {
        const store = createGraphSnapshotStore(snapshot(1));
        const events: unknown[] = [];
        store.subscribe((event) => events.push(event));
        const generation = store.begin();

        expect(store.fail(generation, new Error("broken"))).toBe(true);

        expect(store.current().state).toBe("error");
        expect(store.current().snapshot?.version).toBe(1);
        expect(events).toHaveLength(2);
        expect(events[1]).toEqual({ type: "error", generation, message: "broken" });
    });

    test("事件广播为冻结对象", () => {
        const store = createGraphSnapshotStore(snapshot(1));
        const events: unknown[] = [];
        store.subscribe((event) => events.push(event));

        const generation = store.begin("index-waiting");
        expect(store.commit(generation, snapshot(2))).toBe(true);

        expect(events).toEqual([
            { type: "state-changed", state: "index-waiting", generation },
            { type: "snapshot-ready", version: 2, generation },
        ]);
        expect(events.every(Object.isFrozen)).toBe(true);
    });

    test("dispose 幂等且取消后不再接收事件", () => {
        const store = createGraphSnapshotStore(snapshot(1));
        const events: unknown[] = [];
        const dispose = store.subscribe((event) => events.push(event));

        dispose();
        dispose();
        store.begin();

        expect(events).toEqual([]);
    });
});

function snapshot(version: number): GraphSnapshot {
    const empty = (type: ViewType) => ({ type, nodes: [], edges: [], groups: [], diagnostics: [] });
    return {
        version,
        generatedAt: version,
        project: {},
        views: {
            hierarchy: empty("hierarchy"),
            startup: empty("startup"),
            dependencies: empty("dependencies"),
            "data-flow": empty("data-flow"),
            calls: empty("calls"),
            resources: empty("resources"),
        },
        diagnostics: [],
    };
}
