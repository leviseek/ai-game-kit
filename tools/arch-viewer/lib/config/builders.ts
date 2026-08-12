import type {
    ArchitectureConfig,
    DependencyRuleConfig,
    DependencyRuleOptions,
    HierarchyGroupConfig,
    ResourceLifecycleConfig,
    SemanticFlowConfig,
    SemanticFlowLaneConfig,
    StartupBranchConfig,
    StartupPhaseConfig,
    SymbolRef,
} from "./types";

/**
 * Builder 在配置边界复制并冻结容器，避免后续 Analyzer 或展示层意外改写声明。
 * 未来新增配置字段时仍应在这里完成规范化，而不是把可变输入泄漏到消费者。
 */

function freezeArray<T>(items: readonly T[]): readonly T[] {
    return Object.freeze([...items]);
}

export function symbol(name: string, file?: string): SymbolRef {
    return Object.freeze(file === undefined ? { name } : { name, file });
}

export function group(
    id: string,
    children: readonly (HierarchyGroupConfig | string)[],
    label = id,
): HierarchyGroupConfig {
    return Object.freeze({ id, label, children: freezeArray(children) });
}

function dependencyRule(
    kind: DependencyRuleConfig["kind"],
    from: string,
    to: readonly string[],
    options: DependencyRuleOptions = {},
): DependencyRuleConfig {
    return Object.freeze({ kind, from, to: freezeArray(to), ...options });
}

export function allow(
    from: string,
    to: readonly string[],
    options?: DependencyRuleOptions,
): DependencyRuleConfig {
    return dependencyRule("allow", from, to, options);
}

export function deny(
    from: string,
    to: readonly string[],
    options?: DependencyRuleOptions,
): DependencyRuleConfig {
    return dependencyRule("deny", from, to, options);
}

export function phase(id: string, anchors: readonly SymbolRef[]): StartupPhaseConfig {
    return Object.freeze({ id, anchors: freezeArray(anchors) });
}

export function branch(
    id: string,
    from: SymbolRef,
    anchors: readonly SymbolRef[],
): StartupBranchConfig {
    return Object.freeze({ id, from, anchors: freezeArray(anchors) });
}

export function flow(
    id: string,
    lanes: readonly SemanticFlowLaneConfig[],
): SemanticFlowConfig {
    return Object.freeze({
        id,
        lanes: freezeArray(
            lanes.map((lane) =>
                Object.freeze({
                    id: lane.id,
                    anchors: freezeArray(lane.anchors),
                }),
            ),
        ),
    });
}

export function lifecycle(
    id: string,
    anchors: readonly SymbolRef[],
): ResourceLifecycleConfig {
    return Object.freeze({ id, anchors: freezeArray(anchors) });
}

export function defineArchitectureConfig(config: ArchitectureConfig): ArchitectureConfig {
    return Object.freeze({
        hierarchy: Object.freeze({ root: config.hierarchy.root }),
        dependencyRules: freezeArray(config.dependencyRules),
        startup: Object.freeze({
            entry: config.startup.entry,
            phases: freezeArray(config.startup.phases),
            branches: freezeArray(config.startup.branches),
        }),
        dataFlows: freezeArray(config.dataFlows),
        resources: freezeArray(config.resources),
    });
}
