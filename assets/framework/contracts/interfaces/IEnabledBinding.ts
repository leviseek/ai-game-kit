/** 可用态绑定：控制节点交互与灰化状态。 */
export interface IEnabledBinding<VM> {
    readonly kind: "enabled";
    readonly node: string;
    readonly get: (vm: VM) => boolean;
}
