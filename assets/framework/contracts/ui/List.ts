import type { ViewModelNode } from "./ViewModel";

/**
 * 引擎无关的 GList 视图句柄契约：渲染器/游戏层消费它驱动 fgui 虚拟列表，
 * 不接触 fgui 类型。实现由 Adapter 边界包装 GList，itemRenderer 内把每个
 * item 对象包装为可读写的视图（field 解析 item 内子节点）。
 */

/** 单个列表项的可读写视图：根数据 + 按字段名解析 item 内子节点。 */
export interface FairyGuiListItemView<T> {
    readonly index: number;
    readonly item: T;
    /** 解析 item 内子节点；节点不存在返回 undefined（对齐未知节点容错）。 */
    field(name: string): ViewModelNode | undefined;
}

/** 引擎无关列表句柄：设置数据、渲染回调与点击回调。 */
export interface FairyGuiListHandle<T> {
    /** 更新列表数据并驱动 numItems（触发 itemRenderer 渲染可视项）。 */
    setItems(items: readonly T[]): void;
    /** 设置 item 渲染回调：适配层对每个可视 item 对象调用一次渲染器。 */
    setItemRenderer(renderer: (view: FairyGuiListItemView<T>) => void): void;
    /**
     * 设置 item 点击回调：适配层对每个 item 对象去重注册一次点击，点击时
     * 动态解析该对象当前 index 对应的 item（虚拟列表对象复用，不可闭包捕获
     * 渲染时的 index）。
     */
    setItemClick(handler: (index: number, item: T) => void): void;
}
