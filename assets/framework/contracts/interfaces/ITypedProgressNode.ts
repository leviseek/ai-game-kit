import type { ITypedNode } from "./ITypedNode";

/** 进度节点：归一化 0..1 进度写入（映射到引擎 value 0..100）。 */
export interface ITypedProgressNode extends ITypedNode {
    setProgress(value: number): void;
}
