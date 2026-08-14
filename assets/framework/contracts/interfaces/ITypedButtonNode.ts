import type { ITypedTextNode } from "./ITypedTextNode";

/** 按钮节点：文本能力 + 点击注册。 */
export interface ITypedButtonNode extends ITypedTextNode {
    onClick(handler: () => void): void;
}
