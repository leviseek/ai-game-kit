import type { IFuiView } from "./IFuiView";

/** @FClick 收集的点击元数据：节点名 + 原型方法引用（实例化时 bind this）。 */
export interface IFuiClickMeta {
    readonly nodeName: string;
    readonly methodRef: (this: IFuiView<unknown, unknown>, ...args: unknown[]) => unknown;
}
