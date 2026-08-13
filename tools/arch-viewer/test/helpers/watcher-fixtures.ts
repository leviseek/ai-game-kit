import type { CodeGraphStatus } from "../../lib/codegraph/types";
import type { GraphSnapshot, ViewType } from "../../lib/graph/types";

export class FakeClock {
    private nextId = 1;
    private readonly timers = new Map<number, () => void>();

    public readonly setTimeout = (callback: () => void, _ms: number): number => {
        const id = this.nextId;
        this.nextId += 1;
        this.timers.set(id, callback);
        return id;
    };

    public readonly clearTimeout = (id: number): void => {
        this.timers.delete(id);
    };

    public pending(): number {
        return this.timers.size;
    }

    public async runNext(): Promise<void> {
        const [id, callback] = this.timers.entries().next().value ?? [];
        if (id === undefined || callback === undefined) return;
        this.timers.delete(id);
        callback();
        await flushAsync();
    }

    public async runAll(): Promise<void> {
        while (this.timers.size > 0) await this.runNext();
    }
}

export async function flushAsync(): Promise<void> {
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

export function deferred<T>(): { readonly promise: Promise<T>; resolve(value: T): void } {
    let resolve: (value: T) => void = () => {};
    const promise = new Promise<T>((next) => { resolve = next; });
    return { promise, resolve };
}

export function readyStatus(pendingChanges = { added: 0, modified: 0, removed: 0 }): CodeGraphStatus {
    return {
        initialized: true,
        version: "fake",
        projectPath: "D:/repo",
        indexPath: "D:/repo/.codegraph",
        lastIndexed: null,
        pendingChanges,
    };
}

export function snapshot(version: number): GraphSnapshot {
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
