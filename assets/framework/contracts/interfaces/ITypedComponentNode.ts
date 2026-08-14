import type { ITypedNode } from "./ITypedNode";

/** 组件节点：通用容器（显隐 + 可选点击），fallback 能力 kind。 */
export interface ITypedComponentNode extends ITypedNode {
    onClick?(handler: () => void): void;
}
