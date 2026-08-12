import type { GraphSnapshot, GraphView } from "./types";

type DeepFreezable = readonly unknown[] | Readonly<Record<string, unknown>>;

function isFreezable(value: unknown): value is DeepFreezable {
    return typeof value === "object" && value !== null;
}

function deepFreeze<T>(value: T): T {
    if (!isFreezable(value) || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
}

/** 复制集合边界，后续节点字段扩展不会改变快照冻结语义。 */
function freezeView(view: GraphView): GraphView {
    return deepFreeze({
        ...view,
        nodes: [...view.nodes],
        edges: [...view.edges],
        groups: [...view.groups],
        diagnostics: [...view.diagnostics],
    });
}

export function freezeSnapshot(input: GraphSnapshot): GraphSnapshot {
    const views = deepFreeze({
        hierarchy: freezeView(input.views.hierarchy),
        startup: freezeView(input.views.startup),
        dependencies: freezeView(input.views.dependencies),
        "data-flow": freezeView(input.views["data-flow"]),
        calls: freezeView(input.views.calls),
        resources: freezeView(input.views.resources),
    });

    return deepFreeze({
        ...input,
        project: { ...input.project },
        views,
        diagnostics: [...input.diagnostics],
    });
}
