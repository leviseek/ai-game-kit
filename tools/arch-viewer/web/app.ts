import { ArchApiClient } from "./api.js";
import { connectSnapshotEvents } from "./events.js";
import { fitTransform, renderSvgCanvas, updateCanvasTransform, type CanvasTransform } from "./render/svg.js";
import { bindSearch } from "./render/search.js";
import { renderInspector } from "./render/inspector.js";
import { bindSidebar, renderSidebar } from "./render/sidebar.js";
import { createWorkbenchState, reduceWorkbench } from "./state.js";
import type { WorkbenchAction, WorkbenchState } from "./types.js";
import type { LayoutGraph } from "./layout/types.js";
import type { ViewType } from "../lib/graph/types.js";

export interface WorkbenchApp {
    readonly dispose: () => void;
}

export interface WorkbenchRenderCoordinatorHooks {
    readonly renderChrome: () => void;
    readonly renderCanvas: () => void;
    readonly renderInspector: () => void;
    readonly updateCanvasTransform: () => void;
}

export interface WorkbenchRenderCoordinator {
    readonly renderAll: () => void;
    readonly updateTransform: () => void;
}

type InspectorTab = "Source" | "Relations" | "Evidence" | "Diagnostics";

export function createWorkbenchRenderCoordinator(hooks: WorkbenchRenderCoordinatorHooks): WorkbenchRenderCoordinator {
    return {
        renderAll() {
            hooks.renderChrome();
            hooks.renderCanvas();
            hooks.renderInspector();
        },
        updateTransform() {
            hooks.updateCanvasTransform();
        },
    };
}

export async function startWorkbench(root: Document = document): Promise<WorkbenchApp> {
    const elements = requiredElements(root);
    const client = new ArchApiClient();
    let state: WorkbenchState = createWorkbenchState(await client.view("hierarchy"));
    let transform: CanvasTransform = { x: 0, y: 0, scale: 1 };
    let lastLayout: LayoutGraph | undefined;
    let autoFitNextRender = true;
    let inspectorTab: InspectorTab = "Source";

    const coordinator = createWorkbenchRenderCoordinator({
        renderChrome() {
            renderSidebar(root, state.viewType);
            renderStatus(elements.status, state);
            renderBreadcrumbs(elements.breadcrumbs, state, (id) => void loadGroup(id));
        },
        renderCanvas() {
            lastLayout = renderSvgCanvas(elements.canvas, {
                state,
                transform,
                getTransform: () => transform,
                onSelect: (nodeId) => dispatch({ type: "select-node", nodeId }),
                onExpandGroup: (id) => void loadGroup(id),
                onTransform: (next) => {
                    transform = next;
                    coordinator.updateTransform();
                },
            });
            if (autoFitNextRender && lastLayout !== undefined) {
                transform = createInitialCanvasTransform(elements.canvas, lastLayout, state.viewType);
                updateCanvasTransform(elements.canvas, transform);
                autoFitNextRender = false;
            }
        },
        renderInspector() {
            renderInspector(elements.inspector, {
                client,
                state,
                activeTab: inspectorTab,
                onTab(tab) {
                    inspectorTab = tab;
                    coordinator.renderAll();
                },
            });
        },
        updateCanvasTransform() {
            updateCanvasTransform(elements.canvas, transform);
        },
    });
    const setState = (next: WorkbenchState) => {
        state = next;
        coordinator.renderAll();
    };
    const dispatch = (action: WorkbenchAction) => setState(reduceWorkbench(state, action));

    bindSidebar(root, (viewType) => void loadView(viewType));
    bindSearch({
        input: elements.search,
        results: elements.searchResults,
        onQuery: (query) => client.search(query),
        onSelect: (nodeId) => dispatch({ type: "select-node", nodeId }),
    });
    elements.fit.addEventListener("click", () => {
        if (lastLayout === undefined) return;
        transform = fitTransform(elements.canvas, lastLayout);
        coordinator.updateTransform();
    });
    elements.reset.addEventListener("click", () => {
        transform = { x: 0, y: 0, scale: 1 };
        coordinator.updateTransform();
    });
    const disconnect = connectSnapshotEvents({ client, state: () => state, onState: setState });
    coordinator.renderAll();

    async function loadView(viewType: ViewType): Promise<void> {
        dispatch({ type: "view-loading", viewType });
        try {
            autoFitNextRender = true;
            dispatch({ type: "view-loaded", view: await client.view(viewType) });
        } catch (error) {
            dispatch({ type: "analysis-error", message: error instanceof Error ? error.message : String(error) });
        }
    }

    async function loadGroup(id: string): Promise<void> {
        dispatch({ type: "view-loading", viewType: state.viewType });
        try {
            autoFitNextRender = true;
            dispatch({ type: "group-loaded", groupId: id, view: await client.group(id) });
        } catch (error) {
            dispatch({ type: "analysis-error", message: error instanceof Error ? error.message : String(error) });
        }
    }

    return { dispose: disconnect };
}

export function createInitialCanvasTransform(container: Pick<HTMLElement, "clientWidth" | "clientHeight">, layout: LayoutGraph, viewType: ViewType): CanvasTransform {
    return viewType === "hierarchy" ? fitTransform(container, layout) : { x: 0, y: 0, scale: 1 };
}

function requiredElements(root: Document): Readonly<{
    canvas: HTMLElement;
    inspector: HTMLElement;
    status: HTMLElement;
    breadcrumbs: HTMLElement;
    search: HTMLInputElement;
    searchResults: HTMLElement;
    fit: HTMLButtonElement;
    reset: HTMLButtonElement;
}> {
    return {
        canvas: requireElement(root, "graph-canvas", HTMLElement),
        inspector: requireElement(root, "inspector", HTMLElement),
        status: requireElement(root, "status", HTMLElement),
        breadcrumbs: requireElement(root, "breadcrumbs", HTMLElement),
        search: requireElement(root, "search-input", HTMLInputElement),
        searchResults: requireElement(root, "search-results", HTMLElement),
        fit: requireElement(root, "fit-view", HTMLButtonElement),
        reset: requireElement(root, "reset-view", HTMLButtonElement),
    };
}

function requireElement<T extends Element>(root: Document, id: string, type: new () => T): T {
    const element = root.getElementById(id);
    if (!(element instanceof type)) throw new Error(`Missing #${id}`);
    return element;
}

function renderStatus(container: HTMLElement, state: WorkbenchState): void {
    const text = state.status.kind === "error" ? state.status.message : `${state.viewType} · ${state.currentView.nodes.length} nodes · ${state.currentView.edges.length} edges`;
    container.textContent = text;
    container.dataset.kind = state.status.kind;
}

function renderBreadcrumbs(container: HTMLElement, state: WorkbenchState, onNavigate: (id: string) => void): void {
    if (state.breadcrumbs.length === 0) {
        container.replaceChildren(text("root"));
        return;
    }
    container.replaceChildren(
        ...state.breadcrumbs.map((id, index) => {
            if (index === state.breadcrumbs.length - 1) return text(id);
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = id;
            button.addEventListener("click", () => onNavigate(id));
            return button;
        }),
    );
}

function text(value: string): HTMLSpanElement {
    const span = document.createElement("span");
    span.textContent = value;
    return span;
}
