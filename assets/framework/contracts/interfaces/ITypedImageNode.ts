import type { ITypedNode } from "./ITypedNode";

/**
 * 图片节点：仅显隐（无其它通用能力）。作为能力标记接口存在，
 * 运行时实现与 ITypedComponentNode 相同（见 Adapter 分派），类型区分供静态检查。
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ITypedImageNode extends ITypedNode {}
