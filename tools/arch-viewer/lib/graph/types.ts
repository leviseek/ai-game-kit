/**
 * 六类架构视图共享的纯数据契约。后续扫描器可通过 kind、relation 与 metadata
 * 扩展语义，而不把采集实现泄漏给服务端或 Web 层。
 */

export type ViewType = "hierarchy" | "startup" | "dependencies" | "data-flow" | "calls" | "resources";

export interface SourceLocation {
    readonly filePath: string;
    readonly line?: number;
    readonly column?: number;
    readonly endLine?: number;
    readonly endColumn?: number;
}

export interface Evidence {
    readonly source: string;
    readonly location?: SourceLocation;
    readonly detail?: string;
}

export interface GraphNode {
    readonly id: string;
    readonly kind: string;
    readonly label: string;
    readonly qualifiedName?: string;
    readonly location?: SourceLocation;
    readonly evidence?: readonly Evidence[];
    readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface GraphEdge {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly relation: string;
    readonly label?: string;
    readonly evidence?: readonly Evidence[];
    readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface GraphGroup {
    readonly id: string;
    readonly label: string;
    readonly parentId?: string;
    readonly nodeIds: readonly string[];
    readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface Diagnostic {
    readonly severity: "info" | "warning" | "error";
    readonly message: string;
    readonly source?: string;
    readonly location?: SourceLocation;
}

export interface GraphView {
    readonly type: ViewType;
    readonly rootGroupId?: string;
    readonly nodes: readonly GraphNode[];
    readonly edges: readonly GraphEdge[];
    readonly groups: readonly GraphGroup[];
    readonly diagnostics: readonly Diagnostic[];
}

export interface GraphSnapshot {
    readonly version: number;
    readonly generatedAt: number;
    readonly project: Readonly<Record<string, unknown>>;
    readonly views: Readonly<Record<ViewType, GraphView>>;
    readonly diagnostics: readonly Diagnostic[];
}
