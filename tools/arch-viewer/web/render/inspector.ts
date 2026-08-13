import type { Evidence, GraphEdge, GraphNode, GraphView, SourceLocation } from "../../lib/graph/types.js";
import type { ArchApiClient } from "../api.js";
import type { WorkbenchState } from "../types.js";
import { createVsCodeUrl } from "../vscode.js";

type TabName = "Source" | "Relations" | "Evidence" | "Diagnostics";

export interface SourceExcerpt {
    readonly location: SourceLocation;
    readonly startLine: number;
    readonly endLine: number;
    readonly lines: readonly Readonly<{ number: number; text: string }>[];
}

export interface InspectorOptions {
    readonly client: ArchApiClient;
    readonly state: WorkbenchState;
    readonly activeTab: TabName;
    readonly onTab: (tab: TabName) => void;
}

const tabs: readonly TabName[] = ["Source", "Relations", "Evidence", "Diagnostics"];

export function renderInspector(container: HTMLElement, options: InspectorOptions): void {
    const item = selectedNode(options.state.currentView, options.state.selectedNodeId);
    const header = document.createElement("header");
    const title = document.createElement("h2");
    title.textContent = item?.label ?? "No selection";
    const subtitle = document.createElement("p");
    subtitle.textContent = item === undefined ? "Select a node to inspect." : `${item.kind} ${item.qualifiedName ?? item.id}`;
    header.append(title, subtitle);

    const tabList = document.createElement("div");
    tabList.className = "inspector-tabs";
    tabList.setAttribute("role", "tablist");
    for (const tab of tabs) tabList.append(tabButton(tab, options.activeTab, options.onTab));

    const panel = document.createElement("section");
    panel.className = "inspector-panel";
    panel.setAttribute("role", "tabpanel");
    panel.replaceChildren(renderPanel(item, options));
    container.replaceChildren(header, tabList, panel);
}

function renderPanel(node: GraphNode | undefined, options: InspectorOptions): HTMLElement {
    if (node === undefined) return empty("No selection.");
    switch (options.activeTab) {
        case "Source":
            return renderSource(node, options.client);
        case "Relations":
            return renderRelations(node.id, options.state.currentView);
        case "Evidence":
            return renderEvidence(node.evidence ?? []);
        case "Diagnostics":
            return renderDiagnostics(node.id, options.state.currentView);
    }
}

function renderSource(node: GraphNode, client: ArchApiClient): HTMLElement {
    const wrapper = document.createElement("div");
    if (node.location === undefined) return empty("No source location.");
    const open = sourceLink(undefined);
    const pre = document.createElement("pre");
    pre.textContent = "Loading source...";
    wrapper.append(open, pre);
    void fetchSource(client, node.location)
        .then((source) => {
            open.replaceWith(sourceLink(source));
            pre.textContent = source.lines.map((line) => `${String(line.number).padStart(4, " ")}  ${line.text}`).join("\n");
        })
        .catch((error) => {
            open.replaceWith(sourceLink(undefined));
            pre.textContent = error instanceof Error ? error.message : String(error);
        });
    return wrapper;
}

export function createSourceVsCodeHref(source: SourceExcerpt | undefined): string | undefined {
    return source === undefined ? undefined : createVsCodeUrl(source.location);
}

function sourceLink(source: SourceExcerpt | undefined): HTMLAnchorElement | HTMLSpanElement {
    const href = createSourceVsCodeHref(source);
    if (href === undefined) {
        const disabled = document.createElement("span");
        disabled.className = "source-link disabled";
        disabled.setAttribute("aria-disabled", "true");
        disabled.textContent = "Open in VS Code";
        return disabled;
    }
    const open = document.createElement("a");
    open.className = "source-link";
    open.href = href;
    open.textContent = "Open in VS Code";
    return open;
}

function renderRelations(nodeId: string, view: GraphView): HTMLElement {
    const list = document.createElement("ul");
    for (const edge of view.edges.filter((item) => item.from === nodeId || item.to === nodeId)) {
        const item = document.createElement("li");
        item.textContent = relationText(edge, nodeId);
        list.append(item);
    }
    return list.childElementCount === 0 ? empty("No relations.") : list;
}

function renderEvidence(evidence: readonly Evidence[]): HTMLElement {
    const list = document.createElement("ul");
    for (const entry of evidence) {
        const item = document.createElement("li");
        item.textContent = [entry.source, entry.detail, entry.location?.filePath].filter(Boolean).join(" · ");
        list.append(item);
    }
    return list.childElementCount === 0 ? empty("No evidence.") : list;
}

function renderDiagnostics(nodeId: string, view: GraphView): HTMLElement {
    const list = document.createElement("ul");
    for (const diagnostic of view.diagnostics.filter((item) => item.source === nodeId)) {
        const item = document.createElement("li");
        item.className = `diagnostic-${diagnostic.severity}`;
        item.textContent = `${diagnostic.severity}: ${diagnostic.message}`;
        list.append(item);
    }
    return list.childElementCount === 0 ? empty("No diagnostics.") : list;
}

async function fetchSource(client: ArchApiClient, location: SourceLocation): Promise<SourceExcerpt> {
    const query = new URLSearchParams({ file: location.filePath, line: String(location.line ?? 1) });
    return client.get<SourceExcerpt>(`/api/source?${query.toString()}`);
}

function selectedNode(view: GraphView, id: string | undefined): GraphNode | undefined {
    return id === undefined ? undefined : view.nodes.find((node) => node.id === id);
}

function tabButton(tab: TabName, active: TabName, onTab: (tab: TabName) => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = tab;
    button.className = tab === active ? "active" : "";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(tab === active));
    button.addEventListener("click", () => onTab(tab));
    return button;
}

function relationText(edge: GraphEdge, nodeId: string): string {
    const direction = edge.from === nodeId ? "out" : "in";
    const peer = edge.from === nodeId ? edge.to : edge.from;
    return `${direction} ${edge.relation} ${peer}`;
}

function empty(text: string): HTMLDivElement {
    const element = document.createElement("div");
    element.className = "empty";
    element.textContent = text;
    return element;
}
