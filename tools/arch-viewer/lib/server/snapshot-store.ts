import type { GraphSnapshot } from "../graph/types";

export type AnalysisState = "idle" | "index-waiting" | "analyzing" | "error";

export type SnapshotEvent =
    | Readonly<{ type: "state-changed"; state: AnalysisState; generation: number }>
    | Readonly<{ type: "snapshot-ready"; version: number; generation: number }>
    | Readonly<{ type: "error"; generation: number; message: string }>;

export interface SnapshotCurrent {
    readonly state: AnalysisState;
    readonly generation: number;
    readonly snapshot: GraphSnapshot | undefined;
    readonly error: string | undefined;
}

export interface GraphSnapshotStore {
    begin(state?: Exclude<AnalysisState, "idle" | "error">): number;
    commit(generation: number, snapshot: GraphSnapshot): boolean;
    fail(generation: number, error: Error): boolean;
    current(): SnapshotCurrent;
    subscribe(listener: (event: SnapshotEvent) => void): () => void;
}

export function createGraphSnapshotStore(initialSnapshot?: GraphSnapshot): GraphSnapshotStore {
    let currentGeneration = 0;
    let currentState: AnalysisState = "idle";
    let currentSnapshot = initialSnapshot;
    let currentError: string | undefined;
    const listeners = new Set<(event: SnapshotEvent) => void>();

    function emit(event: SnapshotEvent): void {
        const frozen = Object.freeze(event);
        for (const listener of listeners) listener(frozen);
    }

    return {
        begin(state = "analyzing") {
            currentGeneration += 1;
            currentState = state;
            currentError = undefined;
            emit({ type: "state-changed", state: currentState, generation: currentGeneration });
            return currentGeneration;
        },

        commit(generation, snapshot) {
            if (generation !== currentGeneration) return false;
            currentSnapshot = snapshot;
            currentState = "idle";
            currentError = undefined;
            emit({ type: "snapshot-ready", version: snapshot.version, generation });
            return true;
        },

        fail(generation, error) {
            if (generation !== currentGeneration) return false;
            currentState = "error";
            currentError = error.message;
            emit({ type: "error", generation, message: currentError });
            return true;
        },

        current() {
            return Object.freeze({
                state: currentState,
                generation: currentGeneration,
                snapshot: currentSnapshot,
                error: currentError,
            });
        },

        subscribe(listener) {
            let disposed = false;
            listeners.add(listener);
            return () => {
                if (disposed) return;
                disposed = true;
                listeners.delete(listener);
            };
        },
    };
}
