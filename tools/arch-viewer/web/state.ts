import type { GraphView } from "../lib/graph/types.js";
import type { WorkbenchAction, WorkbenchFilters, WorkbenchState } from "./types.js";

const defaultFilters: WorkbenchFilters = {
    query: "",
    kinds: [],
    relations: [],
    zoom: 1,
};

export function createWorkbenchState(view: GraphView, snapshotVersion = 0): WorkbenchState {
    return {
        viewType: view.type,
        filters: defaultFilters,
        breadcrumbs: view.rootGroupId === undefined ? [] : [view.rootGroupId],
        snapshotVersion,
        status: { kind: "ready" },
        currentView: view,
    };
}

export function reduceWorkbench(state: WorkbenchState, action: WorkbenchAction): WorkbenchState {
    switch (action.type) {
        case "select-node":
            return action.nodeId === undefined
                ? withoutSelected(state)
                : { ...state, selectedNodeId: action.nodeId };
        case "set-filters":
            return { ...state, filters: { ...state.filters, ...action.filters } };
        case "view-loading":
            return { ...state, viewType: action.viewType, status: { kind: "loading" } };
        case "view-loaded":
            return reconcileSnapshot({
                ...state,
                viewType: action.view.type,
                snapshotVersion: action.snapshotVersion ?? state.snapshotVersion,
            }, action.view);
        case "snapshot-ready":
            return reconcileSnapshot({ ...state, snapshotVersion: action.version }, action.view);
        case "analysis-error":
            return { ...state, status: { kind: "error", message: action.message } };
    }
}

export function reconcileSnapshot(state: WorkbenchState, view: GraphView): WorkbenchState {
    const selectedNodeId = existingSelection(state.selectedNodeId, view) ?? nearestExistingBreadcrumb(state.breadcrumbs, view);
    return withSelection({
        ...state,
        viewType: view.type,
        currentView: view,
        breadcrumbs: reconcileBreadcrumbs(state.breadcrumbs, view),
        status: { kind: "ready" },
    }, selectedNodeId);
}

function existingSelection(selectedNodeId: string | undefined, view: GraphView): string | undefined {
    if (selectedNodeId === undefined) return undefined;
    if (view.nodes.some((node) => node.id === selectedNodeId)) return selectedNodeId;
    if (view.groups.some((group) => group.id === selectedNodeId)) return selectedNodeId;
    return undefined;
}

function nearestExistingBreadcrumb(breadcrumbs: readonly string[], view: GraphView): string | undefined {
    for (let index = breadcrumbs.length - 1; index >= 0; index -= 1) {
        const id = breadcrumbs[index];
        if (id !== undefined && view.groups.some((group) => group.id === id)) return id;
    }
    return undefined;
}

function reconcileBreadcrumbs(breadcrumbs: readonly string[], view: GraphView): readonly string[] {
    const groupIds = new Set(view.groups.map((group) => group.id));
    return breadcrumbs.filter((id) => groupIds.has(id));
}

function withSelection(state: WorkbenchState, selectedNodeId: string | undefined): WorkbenchState {
    return selectedNodeId === undefined ? withoutSelected(state) : { ...state, selectedNodeId };
}

function withoutSelected(state: WorkbenchState): WorkbenchState {
    const { selectedNodeId: _selectedNodeId, ...rest } = state;
    return rest;
}
