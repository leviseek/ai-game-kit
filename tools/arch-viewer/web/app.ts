import { ArchApiClient } from "./api";
import { connectSnapshotEvents } from "./events";
import { fitTransform, renderSvgCanvas, type CanvasTransform } from "./render/svg";
import { bindSearch } from "./render/search";
import { renderInspector } from "./render/inspector";
import { bindSidebar, renderSidebar } from "./render/sidebar";
import { createWorkbenchState, reduceWorkbench } from "./state";
import type { WorkbenchAction, WorkbenchState } from "./types";
import type { LayoutGraph } from "./layout/types";
import type { ViewType } from "../lib/graph/types";

export interface WorkbenchApp {
    readonly dispose: () => void;
}

type InspectorTab = "Source" | "Relations" | "Evidence" | "Diagnostics";

export async function startWorkbench(root: Document = document): Promise<WorkbenchApp> {
    const elements = requiredElements(root);
    const client = new ArchApiClient();
    let state: WorkbenchState = createWorkbenchState(await client.view("hierarchy"));
    let transform: CanvasTransform = { x: 0, y: 0, scale: 1 };
    let lastLayout: LayoutGraph | undefined;
    let inspectorTab: InspectorTab = "Source";

    const setState = (next: WorkbenchState) => {
        state = next;
        render();
    };
    const dispatch = (action: WorkbenchAction) => setState(reduceWorkbench(state, action));
    const render = () => {
        renderSidebar(root, state.viewType);
        renderStatus(elements.status, state);
        renderBreadcrumbs(elements.breadcrumbs, state);
        lastLayout = renderSvgCanvas(elements.canvas, {
            state,
            transform,
            onSelect: (nodeId) => dispatch({ type: "select-node", nodeId }),
            onExpandGroup: (id) => void loadGroup(id),
            onTransform: (next) => {
                transform = next;
                render();
            },
        });
        renderInspector(elements.inspector, {
            client,
            state,
            activeTab: inspectorTab,
            onTab(tab) {
                inspectorTab = tab;
                render();
            },
        });
    };

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
        render();
    });
    elements.reset.addEventListener("click", () => {
        transform = { x: 0, y: 0, scale: 1 };
        render();
    });
    const disconnect = connectSnapshotEvents({ client, state: () => state, onState: setState });
    render();

    async function loadView(viewType: ViewType): Promise<void> {
        dispatch({ type: "view-loading", viewType });
        try {
            dispatch({ type: "view-loaded", view: await client.view(viewType) });
        } catch (error) {
            dispatch({ type: "analysis-error", message: error instanceof Error ? error.message : String(error) });
        }
    }

    async function loadGroup(id: string): Promise<void> {
        dispatch({ type: "view-loading", viewType: state.viewType });
        try {
            dispatch({ type: "view-loaded", view: await client.group(id) });
        } catch (error) {
            dispatch({ type: "analysis-error", message: error instanceof Error ? error.message : String(error) });
        }
    }

    return { dispose: disconnect };
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
    const text = state.status.kind === "error"
        ? state.status.message
        : `${state.viewType} · ${state.currentView.nodes.length} nodes · ${state.currentView.edges.length} edges`;
    container.textContent = text;
    container.dataset.kind = state.status.kind;
}

function renderBreadcrumbs(container: HTMLElement, state: WorkbenchState): void {
    container.replaceChildren(...(state.breadcrumbs.length === 0 ? [text("root")] : state.breadcrumbs.map(text)));
}

function text(value: string): HTMLSpanElement {
    const span = document.createElement("span");
    span.textContent = value;
    return span;
}
