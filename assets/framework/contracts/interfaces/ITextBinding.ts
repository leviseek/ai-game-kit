/** 文本绑定：把 VM 字段格式化后写入节点文本。 */
export interface ITextBinding<VM> {
    readonly kind: "text";
    readonly node: string;
    readonly get: (vm: VM) => string;
}
