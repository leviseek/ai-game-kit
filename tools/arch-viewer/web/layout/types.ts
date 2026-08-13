export interface Viewport {
    readonly width: number;
    readonly height: number;
}

export interface LayoutLane {
    readonly id: string;
    readonly label: string;
    readonly index: number;
    readonly x: number;
    readonly y?: number;
    readonly orientation?: "vertical" | "horizontal";
}

export interface LayoutRegion {
    readonly id: string;
    readonly label: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface LayoutNode {
    readonly id: string;
    readonly label: string;
    readonly kind: string;
    readonly detail?: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly laneId: string;
}

export interface LayoutPoint {
    readonly x: number;
    readonly y: number;
}

export interface LayoutEdge {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly relation: string;
    readonly label?: string;
    readonly points: readonly LayoutPoint[];
    readonly diagnosticIds: readonly string[];
}

export interface LayoutGraph {
    readonly width: number;
    readonly height: number;
    readonly nodes: readonly LayoutNode[];
    readonly edges: readonly LayoutEdge[];
    readonly lanes: readonly LayoutLane[];
    readonly regions?: readonly LayoutRegion[];
}
