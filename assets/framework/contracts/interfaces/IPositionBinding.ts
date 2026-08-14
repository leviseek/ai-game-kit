/** 坐标绑定：把 VM 的位置数据（屏幕坐标）映射到节点坐标。 */
export interface IPositionBinding<VM> {
    readonly kind: "position";
    readonly node: string;
    readonly get: (vm: VM) => { x: number; y: number };
}
