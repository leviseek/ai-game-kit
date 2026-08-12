export interface CodeGraphNode {
    readonly id: string;
    readonly kind: string;
    readonly name: string;
    readonly qualifiedName: string;
    readonly filePath: string;
    readonly language: string;
    readonly startLine: number;
    readonly endLine: number;
    readonly startColumn: number;
    readonly endColumn: number;
    readonly docstring?: string;
    readonly signature?: string;
    readonly visibility?: string | null;
    readonly isExported?: boolean;
    readonly isAsync?: boolean;
    readonly isStatic?: boolean;
    readonly isAbstract?: boolean;
    readonly updatedAt: number;
}

export interface CodeGraphFile {
    readonly path: string;
    readonly language: string;
    readonly nodeCount: number;
    readonly size: number;
}

export interface CodeGraphRelationNode {
    readonly name: string;
    readonly kind: string;
    readonly filePath: string;
    readonly startLine: number;
}

export interface CodeGraphStatus {
    readonly initialized: boolean;
    readonly version: string;
    readonly projectPath: string;
    readonly indexPath: string;
    readonly lastIndexed: string | null;
    readonly fileCount?: number;
    readonly nodeCount?: number;
    readonly edgeCount?: number;
    readonly dbSizeBytes?: number;
    readonly backend?: string;
    readonly journalMode?: string;
    readonly nodesByKind?: Readonly<Record<string, number>>;
    readonly languages?: readonly string[];
    readonly pendingChanges?: {
        readonly added: number;
        readonly modified: number;
        readonly removed: number;
    };
    readonly worktreeMismatch?: {
        readonly worktreeRoot: string;
        readonly indexRoot: string;
    } | null;
    readonly index?: {
        readonly builtWithVersion: string;
        readonly builtWithExtractionVersion: number;
        readonly currentExtractionVersion: number;
        readonly reindexRecommended: boolean;
        readonly state: string;
        readonly pendingRefs: number;
    };
}
