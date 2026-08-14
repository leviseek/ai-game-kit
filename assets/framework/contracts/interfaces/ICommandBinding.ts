/** 命令绑定：节点点击触发 VM 命令回调。 */
export interface ICommandBinding<VM> {
    readonly kind: "command";
    readonly node: string;
    readonly run: (vm: VM) => void;
}
