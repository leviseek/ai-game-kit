/**
 * 视图节点接缝：渲染器经它读写单个呈现元素。实现由 Adapter 边界包装
 * 引擎节点（如 fgui 的 GObject），渲染器自身不接触引擎类型。
 */
export interface IViewModelNode {
    setText(value: string): void;
    setProgress(value: number): void;
    setVisible(value: boolean): void;
    /** 注册点击回调；渲染器在绑定建立时调用一次。 */
    onClick(handler: () => void): void;
    /**
     * 可选坐标写入：把 VM 位置数据映射到节点坐标。向后兼容扩展，节点未实现
     * 时渲染器忽略该操作（spec 的"不支持坐标的节点不中断"）。
     */
    setXY?(x: number, y: number): void;
    /**
     * 可选透明度写入：供演示层动画（如飘字淡出/受击闪白）调节节点透明度。
     * 不在绑定 kind 之列——动画器直接调节点，不经渲染器 diff。向后兼容扩展，
     * 节点未实现时动画器跳过该操作。
     */
    setAlpha?(value: number): void;
}
