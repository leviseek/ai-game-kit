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

function freezeSymbol(item: SymbolRef): SymbolRef {
    return symbol(item.name, item.file);
}

function freezeGroup(item: HierarchyGroupConfig): HierarchyGroupConfig {
    return Object.freeze({
        id: item.id,
        label: item.label,
        children: freezeArray(
            item.children.map((child) =>
                typeof child === "string" ? child : freezeGroup(child),
            ),
        ),
    });
}

function freezeRule(item: DependencyRuleConfig): DependencyRuleConfig {
    return Object.freeze({
        kind: item.kind,
        from: item.from,
        to: freezeArray(item.to),
        ...(item.exception === undefined ? {} : { exception: item.exception }),
        ...(item.reason === undefined ? {} : { reason: item.reason }),
    });
}

function freezePhase(item: StartupPhaseConfig): StartupPhaseConfig {
    return Object.freeze({
        id: item.id,
        anchors: freezeArray(item.anchors.map(freezeSymbol)),
    });
}

function freezeBranch(item: StartupBranchConfig): StartupBranchConfig {
    return Object.freeze({
        id: item.id,
        from: freezeSymbol(item.from),
        anchors: freezeArray(item.anchors.map(freezeSymbol)),
    });
}

function freezeFlow(item: SemanticFlowConfig): SemanticFlowConfig {
    return Object.freeze({
        id: item.id,
        lanes: freezeArray(
            item.lanes.map((lane) =>
                Object.freeze({
                    id: lane.id,
                    anchors: freezeArray(lane.anchors.map(freezeSymbol)),
                }),
            ),
        ),
    });
}

function freezeLifecycle(item: ResourceLifecycleConfig): ResourceLifecycleConfig {
    return Object.freeze({
        id: item.id,
        anchors: freezeArray(item.anchors.map(freezeSymbol)),
    });
}

export function symbol(name: string, file?: string): SymbolRef {
    return Object.freeze(file === undefined ? { name } : { name, file });
}

export function group(
    id: string,
    children: readonly (HierarchyGroupConfig | string)[],
    label = id,
): HierarchyGroupConfig {
    return freezeGroup({ id, label, children });
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
    return freezePhase({ id, anchors });
}

export function branch(
    id: string,
    from: SymbolRef,
    anchors: readonly SymbolRef[],
): StartupBranchConfig {
    return freezeBranch({ id, from, anchors });
}

export function flow(
    id: string,
    lanes: readonly SemanticFlowLaneConfig[],
): SemanticFlowConfig {
    return freezeFlow({ id, lanes });
}

export function lifecycle(
    id: string,
    anchors: readonly SymbolRef[],
): ResourceLifecycleConfig {
    return freezeLifecycle({ id, anchors });
}

export function defineArchitectureConfig(config: ArchitectureConfig): ArchitectureConfig {
    return Object.freeze({
        hierarchy: Object.freeze({ root: freezeGroup(config.hierarchy.root) }),
        dependencyRules: freezeArray(config.dependencyRules.map(freezeRule)),
        startup: Object.freeze({
            entry: freezeSymbol(config.startup.entry),
            phases: freezeArray(config.startup.phases.map(freezePhase)),
            branches: freezeArray(config.startup.branches.map(freezeBranch)),
        }),
        dataFlows: freezeArray(config.dataFlows.map(freezeFlow)),
        resources: freezeArray(config.resources.map(freezeLifecycle)),
    });
}
