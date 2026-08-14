import type { ITypedNode } from "./ITypedNode";

/** 文本节点：读写文本与显隐。 */
export interface ITypedTextNode extends ITypedNode {
    setText(value: string): void;
    text(): string;
}
