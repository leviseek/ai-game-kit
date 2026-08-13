import type { ArchApiClient } from "./api.js";
import { reduceWorkbench } from "./state.js";
import type { SnapshotEvent, WorkbenchState } from "./types.js";

export interface SnapshotEventSource {
    addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
    close(): void;
}

export type SnapshotEventSourceFactory = (url: string) => SnapshotEventSource;

export interface SnapshotEventsOptions {
    readonly client: ArchApiClient;
    readonly state: () => WorkbenchState;
    readonly onState: (state: WorkbenchState) => void;
    readonly onEvent?: (event: SnapshotEvent) => void;
    readonly EventSource?: SnapshotEventSourceFactory;
    readonly eventPath?: string;
}

export function connectSnapshotEvents(options: SnapshotEventsOptions): () => void {
    const createEventSource = options.EventSource ?? ((url) => new EventSource(url));
    const source = createEventSource(options.eventPath ?? "/api/events");

    source.addEventListener("snapshot-ready", (message) => {
        const event = parseEvent(message);
        if (event.type !== "snapshot-ready") return;
        options.onEvent?.(event);
        void refreshSnapshot(options, event.version);
    });
    source.addEventListener("error", (message) => {
        const event = parseEvent(message);
        if (event.type !== "error") return;
        options.onEvent?.(event);
        options.onState(reduceWorkbench(options.state(), { type: "analysis-error", message: event.message }));
    });
    source.addEventListener("state-changed", (message) => {
        const event = parseEvent(message);
        if (event.type === "state-changed") options.onEvent?.(event);
    });

    return () => source.close();
}

async function refreshSnapshot(options: SnapshotEventsOptions, version: number): Promise<void> {
    try {
        const state = options.state();
        const view = await options.client.view(state.viewType);
        options.onState(reduceWorkbench(state, { type: "snapshot-ready", version, view }));
    } catch (error) {
        options.onState(reduceWorkbench(options.state(), { type: "analysis-error", message: errorMessage(error) }));
    }
}

function parseEvent(message: MessageEvent<string>): SnapshotEvent {
    return JSON.parse(message.data) as SnapshotEvent;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
