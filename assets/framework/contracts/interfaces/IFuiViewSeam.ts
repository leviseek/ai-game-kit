import type { ITypedNode } from "./ITypedNode";

/**
 * 视图接缝：Adapter 边界包装 FGUI 组件的引擎无关访问面。
 * child() 返回按能力 kind 包装的能力节点（非可选：缺失时由 seam 抛 FuiBindingError）；
 * onClick() 注册点击并返回退订，节点缺失同样抛 FuiBindingError。
 */
export interface IFuiViewSeam {
    /** 按名取子元件能力节点；kind 为 gen-types 的能力 kind（text/button/...）。 */
    child(name: string, kind: string): ITypedNode;
    /** 注册点击监听；返回退订函数。 */
    onClick(name: string, handler: () => void): () => void;
}
