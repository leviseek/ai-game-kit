/**
 * 架构配置只声明仓库语义，不携带扫描结果。未来 Analyzer 可基于这些稳定锚点补充
 * 源码位置与证据，并继续复用 graph 层的数据契约。
 */

export interface SymbolRef {
    readonly name: string;
    readonly file?: string;
}

export interface HierarchyGroupConfig {
    readonly id: string;
    readonly label: string;
    readonly children: readonly (HierarchyGroupConfig | string)[];
}

export interface DependencyRuleOptions {
    readonly exception?: boolean;
    readonly reason?: string;
}

export interface DependencyRuleConfig extends DependencyRuleOptions {
    readonly kind: "allow" | "deny";
    readonly from: string;
    readonly to: readonly string[];
}

export interface StartupPhaseConfig {
    readonly id: string;
    readonly anchors: readonly SymbolRef[];
}

export interface StartupBranchConfig {
    readonly id: string;
    readonly from: SymbolRef;
    readonly anchors: readonly SymbolRef[];
}

export interface StartupConfig {
    readonly entry: SymbolRef;
    readonly phases: readonly StartupPhaseConfig[];
    readonly branches: readonly StartupBranchConfig[];
}

export interface SemanticFlowLaneConfig {
    readonly id: string;
    readonly anchors: readonly SymbolRef[];
}

export interface SemanticFlowConfig {
    readonly id: string;
    readonly lanes: readonly SemanticFlowLaneConfig[];
}

export interface ResourceLifecycleConfig {
    readonly id: string;
    readonly anchors: readonly SymbolRef[];
}

export interface ArchitectureConfig {
    readonly hierarchy: {
        readonly root: HierarchyGroupConfig;
    };
    readonly dependencyRules: readonly DependencyRuleConfig[];
    readonly startup: StartupConfig;
    readonly dataFlows: readonly SemanticFlowConfig[];
    readonly resources: readonly ResourceLifecycleConfig[];
}
