import type { ITypedTextNode } from "./ITypedTextNode";

/** 输入节点：文本能力 + 读取输入值（单向数据流下 action 构造时读）。 */
export interface ITypedInputNode extends ITypedTextNode {
    readText(): string;
}
