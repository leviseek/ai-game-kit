/** 进度绑定：把 VM 数值（归一化 0..1）写入节点进度。 */
export interface IProgressBinding<VM> {
    readonly kind: "progress";
    readonly node: string;
    readonly get: (vm: VM) => number;
}
