import type { GraphEdge, GraphGroup, GraphNode, GraphView } from "../../lib/graph/types.js";
import type { LayoutEdge, LayoutGraph, LayoutLane, LayoutNode, LayoutRegion, Viewport } from "./types.js";

const margin = 48;
const bandHeight = 108;
const bandGap = 22;
const cardGap = 24;
const regionGap = 48;
const regionPadding = 16;
const rowGap = 20;
const regionBandGap = 32;
const maxOverviewWidth = 1380;

export function layoutHierarchy(view: GraphView, viewport: Viewport): LayoutGraph {
    const root = view.groups.find((group) => group.id === view.rootGroupId);
    if (root === undefined) return { width: 320, height: 240, nodes: [], edges: [], lanes: [] };
    const groups = visibleGroups(view.groups, root);
    const groupIds = new Set(groups.map((group) => group.id));
    const symbols = groups.length === 1
        ? view.nodes.filter((node) => node.metadata?.parentId === root.id || root.nodeIds.includes(node.id))
        : [];
    const depths = new Map<string, number>([[root.id, 0]]);
    for (const group of groups) depths.set(group.id, relativeDepth(group, groupIds, view.groups, root.id));
    for (const symbol of symbols) depths.set(symbol.id, 1);
    const items = [
        ...groups.map((group) => groupItem(group, depths.get(group.id) ?? 0, groupOrder(group, view.groups))),
        ...symbols.map((node) => symbolItem(node, depths.get(node.id) ?? 1, `${root.id}/${node.label}/${node.id}`)),
    ];

    // 概览（根 level 0）才启用大分支 region 包裹；下钻视图保留普通分层
    const plans = (metadataNumber(root, "level") ?? 0) === 0 ? buildRegionPlans(items) : [];
    if (plans.length > 0) return layoutOverview(root, groups, groupIds, items, plans, viewport);
    return layoutBands(root, groups, symbols, groupIds, items, viewport);
}

interface HierarchyItem {
    readonly id: string;
    readonly label: string;
    readonly kind: string;
    readonly detail?: string;
    readonly parentId?: string;
    readonly depth: number;
    readonly width: number;
    readonly height: number;
    readonly order: string;
}

interface RegionPlan {
    readonly branch: HierarchyItem;
    readonly descendants: readonly HierarchyItem[];
}

interface RegionBand {
    readonly depth: number;
    readonly rows: readonly (readonly HierarchyItem[])[];
    readonly rowHeight: number;
}

function buildRegionPlans(items: readonly HierarchyItem[]): readonly RegionPlan[] {
    const itemById = new Map(items.map((item) => [item.id, item]));
    const plans: RegionPlan[] = [];
    for (const branch of items.filter((item) => item.depth === 1)) {
        const descendants = items
            .filter((item) => item.depth >= 2 && depthOneAncestor(item, itemById) === branch.id)
            .sort(byOrder);
        if (descendants.length === 0) continue;
        plans.push({ branch, descendants });
    }
    return plans;
}

function depthOneAncestor(item: HierarchyItem, itemById: ReadonlyMap<string, HierarchyItem>): string | undefined {
    let current = item;
    while (current.depth > 1) {
        const parent = current.parentId === undefined ? undefined : itemById.get(current.parentId);
        if (parent === undefined) return undefined;
        current = parent;
    }
    return current.id;
}

function layoutOverview(
    root: GraphGroup,
    groups: readonly GraphGroup[],
    groupIds: ReadonlySet<string>,
    items: readonly HierarchyItem[],
    plans: readonly RegionPlan[],
    viewport: Viewport,
): LayoutGraph {
    const rootItem = items.find((item) => item.id === root.id);
    if (rootItem === undefined) return { width: 320, height: 240, nodes: [], edges: [], lanes: [] };

    const contentBudget = maxOverviewWidth - margin * 2 - regionGap * (plans.length - 1);
    const maxRegionContent = Math.max(280, Math.floor(contentBudget / plans.length));

    const laid = plans.map(({ branch, descendants }) => {
        const bands = regionBands(descendants, maxRegionContent);
        const contentWidth = Math.max(0, ...bands.flatMap((band) => band.rows.map((row) => rowWidth(row))));
        return { branch, bands, width: contentWidth + regionPadding * 2 };
    });

    const totalWidth = laid.reduce((total, item) => total + item.width, 0) + regionGap * (laid.length - 1);
    const width = Math.max(720, viewport.width, totalWidth) + margin * 2;
    const rootY = margin;

    const nodes: LayoutNode[] = [];
    const regions: LayoutRegion[] = [];
    let regionY = rootY + rootItem.height + regionBandGap;

    // 无子级的一级节点集中在 regions 上方的独立行
    const standalone = items
        .filter((item) => item.depth === 1 && !laid.some((item2) => item2.branch.id === item.id))
        .sort(byOrder);
    if (standalone.length > 0) {
        let x = (width - rowWidth(standalone)) / 2;
        for (const card of standalone) {
            nodes.push({ ...card, x, y: regionY, laneId: "depth:1" });
            x += card.width + cardGap;
        }
        regionY += Math.max(...standalone.map((item) => item.height)) + regionBandGap;
    }

    // region 内：分支卡片作为头部，后代按深度分带、行内换行包裹
    let regionX = (width - totalWidth) / 2;
    for (const { branch, bands, width: regionWidth } of laid) {
        nodes.push({ ...branch, x: regionX + (regionWidth - branch.width) / 2, y: regionY + regionPadding, laneId: "depth:1" });
        let rowTop = regionY + regionPadding + branch.height + regionPadding;
        for (const band of bands) {
            for (const row of band.rows) {
                let x = regionX + (regionWidth - rowWidth(row)) / 2;
                for (const item of row) {
                    nodes.push({ ...item, x, y: rowTop, laneId: `depth:${band.depth}` });
                    x += item.width + cardGap;
                }
                rowTop += band.rowHeight + rowGap;
            }
        }
        regions.push({
            id: `branch:${branch.id}`,
            label: branch.label,
            x: regionX,
            y: regionY,
            width: regionWidth,
            height: rowTop - regionY + regionPadding,
        });
        regionX += regionWidth + regionGap;
    }

    nodes.push({ ...rootItem, x: (width - rootItem.width) / 2, y: rootY, laneId: "depth:0" });

    const maxRegionHeight = Math.max(0, ...regions.map((region) => region.height));
    const edges = hierarchyEdges(groups, [], groupIds, nodes, root.id);
    return {
        width,
        height: Math.max(240, regionY + maxRegionHeight + margin),
        nodes: nodes.sort((left, right) => left.id.localeCompare(right.id)),
        edges,
        lanes: [],
        regions,
    };
}

function regionBands(descendants: readonly HierarchyItem[], maxWidth: number): readonly RegionBand[] {
    const byDepth = new Map<number, HierarchyItem[]>();
    for (const item of descendants) {
        const list = byDepth.get(item.depth) ?? [];
        list.push(item);
        byDepth.set(item.depth, list);
    }
    return [...byDepth.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([depth, list]) => {
            const sorted = [...list].sort(byOrder);
            const rows = wrapRows(sorted, maxWidth);
            return { depth, rows, rowHeight: Math.max(...rows.flatMap((row) => row.map((item) => item.height))) };
        });
}

function wrapRows(items: readonly HierarchyItem[], maxWidth: number): readonly (readonly HierarchyItem[])[] {
    const rows: HierarchyItem[][] = [];
    let row: HierarchyItem[] = [];
    let rowWidthValue = 0;
    for (const item of items) {
        const added = item.width + (row.length === 0 ? 0 : cardGap);
        if (row.length > 0 && rowWidthValue + added > maxWidth) {
            rows.push(row);
            row = [item];
            rowWidthValue = item.width;
        } else {
            row.push(item);
            rowWidthValue += added;
        }
    }
    if (row.length > 0) rows.push(row);
    return rows;
}

function byOrder(left: HierarchyItem, right: HierarchyItem): number {
    return left.order.localeCompare(right.order) || left.id.localeCompare(right.id);
}

function layoutBands(
    root: GraphGroup,
    groups: readonly GraphGroup[],
    symbols: readonly GraphNode[],
    groupIds: ReadonlySet<string>,
    items: readonly HierarchyItem[],
    viewport: Viewport,
): LayoutGraph {
    const rows = [...new Set(items.map((item) => item.depth))].sort((left, right) => left - right);
    const rowWidths = new Map(rows.map((depth) => [depth, rowWidth(items.filter((item) => item.depth === depth))]));
    const width = Math.max(720, viewport.width, ...rowWidths.values()) + margin * 2;
    const nodes: LayoutNode[] = [];
    const lanes: LayoutLane[] = [];

    for (const [index, depth] of rows.entries()) {
        const row = items.filter((item) => item.depth === depth).sort(byOrder);
        const totalWidth = rowWidths.get(depth) ?? 0;
        let x = (width - totalWidth) / 2;
        const bandY = margin + index * (bandHeight + bandGap);
        lanes.push({ id: `depth:${depth}`, label: depthLabel(depth, root), index, x: margin / 2, y: bandY, orientation: "horizontal" });
        for (const item of row) {
            nodes.push({ id: item.id, label: item.label, kind: item.kind, detail: item.detail, x, y: bandY + 30, width: item.width, height: item.height, laneId: `depth:${depth}` });
            x += item.width + cardGap;
        }
    }

    const centeredNodes = centerRoot(nodes, root.id, width);

    const edges = hierarchyEdges(groups, symbols, groupIds, centeredNodes, root.id);
    return {
        width,
        height: Math.max(240, margin * 2 + rows.length * bandHeight + Math.max(0, rows.length - 1) * bandGap),
        nodes: centeredNodes.sort((left, right) => left.id.localeCompare(right.id)),
        edges,
        lanes,
    };
}

function visibleGroups(groups: readonly GraphGroup[], root: GraphGroup): readonly GraphGroup[] {
    const rootLevel = metadataNumber(root, "level") ?? 0;
    if (rootLevel === 0) {
        return groups.filter((group) => {
            const level = metadataNumber(group, "level") ?? 0;
            return level <= 3 && (group.id === root.id || group.metadata?.kind === "config" || group.metadata?.kind === "component");
        });
    }
    return [root, ...groups.filter((group) => group.parentId === root.id)];
}

function relativeDepth(group: GraphGroup, visible: ReadonlySet<string>, groups: readonly GraphGroup[], rootId: string): number {
    let depth = 0;
    let current = group;
    while (current.id !== rootId && current.parentId !== undefined && visible.has(current.parentId)) {
        depth += 1;
        const parent = groups.find((item) => item.id === current.parentId);
        if (parent === undefined) break;
        current = parent;
    }
    return depth;
}

function groupItem(group: GraphGroup, depth: number, order: string): HierarchyItem {
    return {
        id: group.id,
        label: group.label,
        kind: "group",
        ...(group.parentId === undefined ? {} : { parentId: group.parentId }),
        depth,
        width: Math.max(170, Math.min(280, group.label.length * 10 + 90)),
        height: 64,
        detail: `${metadataNumber(group, "fileCount") ?? 0} files · ${metadataNumber(group, "symbolCount") ?? 0} symbols`,
        order,
    };
}

function symbolItem(node: GraphNode, depth: number, order: string): HierarchyItem {
    return { id: node.id, label: node.label, kind: node.kind, depth, width: Math.max(140, Math.min(240, node.label.length * 9 + 60)), height: 50, order };
}

function rowWidth(items: readonly HierarchyItem[]): number {
    return items.reduce((total, item) => total + item.width, 0) + Math.max(0, items.length - 1) * cardGap;
}

function hierarchyEdges(
    groups: readonly GraphGroup[],
    symbols: readonly GraphNode[],
    visible: ReadonlySet<string>,
    nodes: readonly LayoutNode[],
    rootId: string,
): readonly LayoutEdge[] {
    const sources: GraphEdge[] = groups
        .filter((group) => group.id !== rootId && group.parentId !== undefined && visible.has(group.parentId))
        .map((group) => ({ id: `contains:${group.parentId}:${group.id}`, from: group.parentId!, to: group.id, relation: "contains" }));
    sources.push(...symbols.map((node) => ({ id: `contains:${rootId}:${node.id}`, from: rootId, to: node.id, relation: "contains" })));
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return sources.map((edge) => ({ ...edge, points: verticalRoute(byId.get(edge.from), byId.get(edge.to)), diagnosticIds: [] }));
}

function verticalRoute(from: LayoutNode | undefined, to: LayoutNode | undefined): readonly { x: number; y: number }[] {
    if (from === undefined || to === undefined) return [];
    const start = { x: from.x + from.width / 2, y: from.y + from.height };
    const end = { x: to.x + to.width / 2, y: to.y };
    const middleY = start.y + (end.y - start.y) / 2;
    return [start, { x: start.x, y: middleY }, { x: end.x, y: middleY }, end];
}

function depthLabel(depth: number, root: GraphGroup): string {
    return depth === 0 ? root.label : `Layer ${depth}`;
}

function centerRoot(nodes: readonly LayoutNode[], rootId: string, width: number): LayoutNode[] {
    return nodes.map((node) => node.id === rootId ? { ...node, x: (width - node.width) / 2 } : node);
}

function groupOrder(group: GraphGroup, groups: readonly GraphGroup[]): string {
    const parts = [group.label, group.id];
    let parentId = group.parentId;
    while (parentId !== undefined) {
        const parent = groups.find((item) => item.id === parentId);
        if (parent === undefined) break;
        parts.unshift(parent.label, parent.id);
        parentId = parent.parentId;
    }
    return parts.join("/");
}

function metadataNumber(group: GraphGroup, key: string): number | undefined {
    const value = group.metadata?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
