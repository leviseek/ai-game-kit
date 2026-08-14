import type { ITypedNode } from "./ITypedNode";

/**
 * 列表节点：容器能力（MVP 仅显隐，随真实需求扩展）。
 * 作为能力标记接口存在，运行时实现同 ITypedComponentNode。
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ITypedListNode extends ITypedNode {}
