import type { GraphView, ViewType } from "../lib/graph/types.js";

export interface WorkbenchFilters {
    readonly query: string;
    readonly kinds: readonly string[];
    readonly relations: readonly string[];
    readonly zoom: number;
}

export type WorkbenchStatus =
    | Readonly<{ kind: "idle" }>
    | Readonly<{ kind: "loading" }>
    | Readonly<{ kind: "ready" }>
    | Readonly<{ kind: "error"; message: string }>;

export interface WorkbenchState {
    readonly viewType: ViewType;
    readonly filters: WorkbenchFilters;
    readonly breadcrumbs: readonly string[];
    readonly selectedNodeId?: string;
    readonly snapshotVersion: number;
    readonly status: WorkbenchStatus;
    readonly currentView: GraphView;
}

export type WorkbenchAction =
    | Readonly<{ type: "select-node"; nodeId: string | undefined }>
    | Readonly<{ type: "set-filters"; filters: Partial<WorkbenchFilters> }>
    | Readonly<{ type: "view-loading"; viewType: ViewType }>
    | Readonly<{ type: "view-loaded"; view: GraphView; snapshotVersion?: number }>
    | Readonly<{ type: "group-loaded"; groupId: string; view: GraphView }>
    | Readonly<{ type: "snapshot-ready"; version: number; view: GraphView }>
    | Readonly<{ type: "analysis-error"; message: string }>;

export type SnapshotEvent =
    | Readonly<{ type: "state-changed"; state: "idle" | "index-waiting" | "analyzing" | "error"; generation: number }>
    | Readonly<{ type: "snapshot-ready"; version: number; generation: number }>
    | Readonly<{ type: "error"; generation: number; message: string }>;
