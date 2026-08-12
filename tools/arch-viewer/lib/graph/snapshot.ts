import type { GraphSnapshot, GraphView } from "./types";

/** 复制集合边界，后续节点字段扩展不会改变快照冻结语义。 */
function freezeView(view: GraphView): GraphView {
    return Object.freeze({
        ...view,
        nodes: Object.freeze([...view.nodes]),
        edges: Object.freeze([...view.edges]),
        groups: Object.freeze([...view.groups]),
        diagnostics: Object.freeze([...view.diagnostics]),
    });
}

export function freezeSnapshot(input: GraphSnapshot): GraphSnapshot {
    const views = Object.freeze({
        hierarchy: freezeView(input.views.hierarchy),
        startup: freezeView(input.views.startup),
        dependencies: freezeView(input.views.dependencies),
        "data-flow": freezeView(input.views["data-flow"]),
        calls: freezeView(input.views.calls),
        resources: freezeView(input.views.resources),
    });

    return Object.freeze({
        ...input,
        project: Object.freeze({ ...input.project }),
        views,
        diagnostics: Object.freeze([...input.diagnostics]),
    });
}
