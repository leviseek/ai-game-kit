/** 显隐绑定：把 VM 布尔值映射为节点可见性。 */
export interface IVisibleBinding<VM> {
    readonly kind: "visible";
    readonly node: string;
    readonly get: (vm: VM) => boolean;
}
