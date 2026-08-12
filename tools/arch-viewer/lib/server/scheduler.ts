import type { ArchitectureBuildInput } from "../analysis/analyzer";
import type { CodeGraphGateway } from "../codegraph/gateway";
import type { CodeGraphStatus } from "../codegraph/types";
import type { GraphSnapshot } from "../graph/types";
import type { GraphSnapshotStore } from "./snapshot-store";

export interface AnalysisScheduler {
    trigger(): void;
    dispose(): void;
}

type TimerHandle = number | ReturnType<typeof setTimeout>;

export interface AnalysisSchedulerOptions {
    readonly sync: CodeGraphGateway["sync"];
    readonly status?: CodeGraphGateway["status"];
    readonly analyze: (input: ArchitectureBuildInput) => Promise<GraphSnapshot>;
    readonly store: GraphSnapshotStore;
    readonly debounceMs: number;
    readonly setTimeout?: (callback: () => void, ms: number) => TimerHandle;
    readonly clearTimeout?: (timer: TimerHandle) => void;
}

export function createAnalysisScheduler(options: AnalysisSchedulerOptions): AnalysisScheduler {
    const scheduleTimeout = options.setTimeout ?? setTimeout;
    const clearScheduleTimeout = options.clearTimeout ?? clearTimeout;
    const readStatus = options.status;
    let timer: TimerHandle | undefined;
    let running = false;
    let followUp = false;
    let disposed = false;
    let nextVersion = 1;

    function trigger(): void {
        if (disposed) return;
        if (running) {
            followUp = true;
            return;
        }
        if (timer !== undefined) clearScheduleTimeout(timer);
        timer = scheduleTimeout(() => {
            timer = undefined;
            void rebuild();
        }, options.debounceMs);
    }

    async function rebuild(): Promise<void> {
        if (disposed || running) return;
        running = true;
        try {
            const status = await syncAndReadStatus(options.sync, readStatus);
            if (status === undefined && readStatus !== undefined) {
                options.store.begin("index-waiting");
                return;
            }
            if (status !== undefined && hasPendingChanges(status)) {
                options.store.begin("index-waiting");
                return;
            }
            const generation = options.store.begin();
            try {
                const snapshot = await options.analyze({ version: nextVersion });
                nextVersion += 1;
                options.store.commit(generation, snapshot);
            } catch (error) {
                options.store.fail(generation, toError(error));
            }
        } finally {
            running = false;
            if (!disposed && followUp) {
                followUp = false;
                void rebuild();
            }
        }
    }

    return {
        trigger,
        dispose() {
            disposed = true;
            followUp = false;
            if (timer !== undefined) {
                clearScheduleTimeout(timer);
                timer = undefined;
            }
        },
    };
}

async function syncAndReadStatus(
    sync: CodeGraphGateway["sync"],
    status: CodeGraphGateway["status"] | undefined,
): Promise<CodeGraphStatus | undefined> {
    try {
        await sync();
        return status === undefined ? undefined : await status();
    } catch (_error) {
        return undefined;
    }
}

function toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

function hasPendingChanges(status: CodeGraphStatus): boolean {
    const pendingChanges = status.pendingChanges;
    if (pendingChanges === undefined) return false;
    return pendingChanges.added !== 0 || pendingChanges.modified !== 0 || pendingChanges.removed !== 0;
}
