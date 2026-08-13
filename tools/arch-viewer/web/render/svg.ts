import type { Diagnostic, GraphView } from "../../lib/graph/types.js";
import { layoutView } from "../layout/shared.js";
import type { LayoutEdge, LayoutGraph, LayoutLane, LayoutRegion } from "../layout/types.js";
import type { WorkbenchState } from "../types.js";

const ns = ["http", "://www.w3.org/2000/svg"].join("");

export interface CanvasTransform {
    readonly x: number;
    readonly y: number;
    readonly scale: number;
}

export interface SvgRendererOptions {
    readonly state: WorkbenchState;
    readonly transform: CanvasTransform;
    readonly getTransform: () => CanvasTransform;
    readonly onSelect: (id: string | undefined) => void;
    readonly onExpandGroup: (id: string) => void;
    readonly onTransform: (transform: CanvasTransform) => void;
}

export interface CanvasPoint {
    readonly x: number;
    readonly y: number;
}

export function updateCanvasTransform(container: HTMLElement, transform: CanvasTransform): void {
    const content = container.querySelector<SVGGElement>("[data-graph-content]");
    if (content !== null) content.setAttribute("transform", toTransform(transform));
}

export function wheelCanvasTransform(transform: CanvasTransform, deltaY: number): CanvasTransform {
    return { ...transform, scale: clamp(0.25, 2.5, transform.scale * (deltaY > 0 ? 0.9 : 1.1)) };
}

export function dragCanvasTransform(transform: CanvasTransform, start: CanvasPoint, current: CanvasPoint): CanvasTransform {
    return {
        ...transform,
        x: transform.x + current.x - start.x,
        y: transform.y + current.y - start.y,
    };
}

export function renderSvgCanvas(container: HTMLElement, options: SvgRendererOptions): LayoutGraph {
    const viewport = { width: container.clientWidth || 960, height: container.clientHeight || 640 };
    const layout = layoutView(options.state.currentView, viewport);
    const svg = document.createElementNS(ns, "svg");
    if (!(svg instanceof SVGSVGElement)) throw new Error("SVG root unavailable");
    svg.setAttribute("viewBox", `0 0 ${viewport.width} ${viewport.height}`);
    svg.setAttribute("role", "img");
    const content = svgElement("g", { transform: toTransform(options.transform), "data-graph-content": "true" });

    svg.append(content);
    renderLanes(content, layout);
    renderRegions(content, layout);
    renderEdges(content, layout, options.state.currentView);
    renderNodes(content, layout, options);
    wirePanZoom(svg, options);
    container.replaceChildren(svg);
    return layout;
}

export function fitTransform(container: Pick<HTMLElement, "clientWidth" | "clientHeight">, layout: LayoutGraph): CanvasTransform {
    const width = container.clientWidth || 960;
    const height = container.clientHeight || 640;
    const scale = Math.min(1.6, Math.max(0.25, Math.min(width / layout.width, height / layout.height) * 0.9));
    return { x: (width - layout.width * scale) / 2, y: (height - layout.height * scale) / 2, scale };
}

function renderLanes(parent: SVGElement, layout: LayoutGraph): void {
    for (const lane of layout.lanes) {
        const band = hierarchyBandBounds(lane, layout.width);
        if (band !== undefined) {
            parent.append(svgElement("rect", { ...band, rx: 14, class: "hierarchy-band" }), svgText(lane.label, band.x + 16, band.y + 21, "hierarchy-band-label"));
            continue;
        }
        const line = svgElement("line", { x1: lane.x, y1: 20, x2: lane.x, y2: layout.height, class: "lane-line" });
        const label = svgText(lane.label, lane.x, 24, "lane-label");
        parent.append(line, label);
    }
}

function renderEdges(parent: SVGElement, layout: LayoutGraph, view: GraphView): void {
    const diagnostics = diagnosticsBySource(view.diagnostics);
    for (const edge of layout.edges) {
        if (edge.points.length < 2) continue;
        const path = svgElement("path", {
            d: edgePath(edge),
            class: edge.diagnosticIds.length > 0 ? "edge edge-diagnostic" : "edge",
            "data-edge-id": edge.id,
        });
        path.append(svgElement("title", {}, edgeTitle(edge, diagnostics)));
        parent.append(path);
        if (edge.diagnosticIds.length > 0) parent.append(renderEdgeBadge(edge));
    }
}

function renderNodes(parent: SVGElement, layout: LayoutGraph, options: SvgRendererOptions): void {
    const groupIds = new Set(options.state.currentView.groups.map((group) => group.id));
    const selectedId = options.state.selectedNodeId;
    for (const node of layout.nodes) {
        const group = svgElement("g", {
            role: "button",
            tabindex: "0",
            class: nodeVisualClass(node, selectedId === node.id),
            "data-node-id": node.id,
            transform: `translate(${node.x} ${node.y})`,
        });
        group.append(svgElement("rect", { width: node.width, height: node.height, rx: 6 }), svgText(node.label, 14, 19, "node-label"), svgText(node.detail ?? node.kind, 14, 34, "node-kind"));
        group.addEventListener("click", () => options.onSelect(node.id));
        group.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") options.onSelect(node.id);
        });
        group.addEventListener("dblclick", () => {
            if (groupIds.has(node.id)) options.onExpandGroup(node.id);
        });
        parent.append(group);
    }
}

export function nodeVisualClass(node: Pick<LayoutGraph["nodes"][number], "kind">, selected: boolean): string {
    const classes = ["node"];
    if (node.kind === "group") classes.push("node-group");
    if (selected) classes.push("selected");
    return classes.join(" ");
}

export function hierarchyBandBounds(lane: LayoutLane, layoutWidth: number): Readonly<{ x: number; y: number; width: number; height: number }> | undefined {
    if (lane.orientation !== "horizontal" || lane.y === undefined) return undefined;
    return { x: 20, y: lane.y, width: Math.max(280, layoutWidth - 40), height: 108 };
}

function renderRegions(parent: SVGElement, layout: LayoutGraph): void {
    for (const region of layout.regions ?? []) {
        parent.append(svgElement("rect", { ...region, rx: 14, class: "hierarchy-region" }), svgText(region.label, region.x + 16, region.y + 22, "hierarchy-region-label"));
    }
}

export function regionBounds(region: LayoutRegion): Readonly<{ x: number; y: number; width: number; height: number }> {
    return { x: region.x, y: region.y, width: region.width, height: region.height };
}

function wirePanZoom(svg: SVGSVGElement, options: SvgRendererOptions): void {
    let dragStart: Readonly<{ x: number; y: number; transform: CanvasTransform }> | undefined;
    svg.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || (event.target instanceof Element && event.target.closest(".node") !== null)) return;
        svg.setPointerCapture(event.pointerId);
        dragStart = { x: event.clientX, y: event.clientY, transform: options.getTransform() };
    });
    svg.addEventListener("pointermove", (event) => {
        if (dragStart === undefined) return;
        options.onTransform(dragCanvasTransform(dragStart.transform, dragStart, { x: event.clientX, y: event.clientY }));
    });
    svg.addEventListener("pointerup", () => {
        dragStart = undefined;
    });
    svg.addEventListener(
        "wheel",
        (event) => {
            event.preventDefault();
            options.onTransform(wheelCanvasTransform(options.getTransform(), event.deltaY));
        },
        { passive: false },
    );
}

function edgePath(edge: LayoutEdge): string {
    const [first, ...rest] = edge.points;
    if (first === undefined) return "";
    return [`M ${first.x} ${first.y}`, ...rest.map((point) => `L ${point.x} ${point.y}`)].join(" ");
}

function renderEdgeBadge(edge: LayoutEdge): SVGTextElement {
    const point = edge.points[Math.floor(edge.points.length / 2)] ?? edge.points[0] ?? { x: 0, y: 0 };
    return svgText("diagnostic", point.x + 8, point.y - 8, "edge-badge");
}

function diagnosticsBySource(diagnostics: readonly Diagnostic[]): ReadonlyMap<string, readonly Diagnostic[]> {
    const result = new Map<string, Diagnostic[]>();
    for (const diagnostic of diagnostics) {
        if (diagnostic.source === undefined) continue;
        result.set(diagnostic.source, [...(result.get(diagnostic.source) ?? []), diagnostic]);
    }
    return result;
}

function edgeTitle(edge: LayoutEdge, diagnostics: ReadonlyMap<string, readonly Diagnostic[]>): string {
    const messages = diagnostics.get(edge.id)?.map((diagnostic) => `${diagnostic.severity}: ${diagnostic.message}`) ?? [];
    return [`${edge.from} ${edge.relation} ${edge.to}`, ...messages].join("\n");
}

function toTransform(transform: CanvasTransform): string {
    return `translate(${transform.x} ${transform.y}) scale(${transform.scale})`;
}

function svgText(text: string, x: number, y: number, className: string): SVGTextElement {
    return svgElement("text", { x, y, class: className }, text) as SVGTextElement;
}

function svgElement(name: string, attributes: Record<string, string | number> = {}, text?: string): SVGElement {
    const element = document.createElementNS(ns, name);
    if (!(element instanceof SVGElement)) throw new Error(`SVG element unavailable: ${name}`);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    if (text !== undefined) element.textContent = text;
    return element;
}

function clamp(min: number, max: number, value: number): number {
    return Math.max(min, Math.min(max, value));
}
