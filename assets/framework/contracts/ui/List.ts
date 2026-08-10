import type { ViewModelNode } from "./ViewModel";

/**
 * 引擎无关的 GList 视图句柄契约：渲染器/游戏层消费它驱动 fgui 虚拟列表，
 * 不接触 fgui 类型。实现由 Adapter 边界包装 GList，itemRenderer 内把每个
 * item 对象包装为可读写的视图（field 解析 item 内子节点）。
 *
 * 装配时序：setItemRenderer / setItemClick 必须先于 setItems 调用（渲染与
 * 点击注册都在 itemRenderer 对可视项调用时发生），随后反复 setItems 驱动数据。
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
    /**
     * 更新列表数据并驱动 numItems（触发 itemRenderer 渲染可视项）。必须在
     * setItemRenderer / setItemClick 之后调用，否则已渲染对象不补注册回调。
     */
    setItems(items: readonly T[]): void;
    /**
     * 设置 item 渲染回调：适配层对每个可视 item 对象调用一次渲染器。
     * 必须在 setItems 之前调用；替换 renderer 不追溯已渲染对象。
     */
    setItemRenderer(renderer: (view: FairyGuiListItemView<T>) => void): void;
    /**
     * 设置 item 点击回调：适配层对每个 item 对象去重注册一次点击，点击时
     * 动态解析该对象当前 index 对应的 item（虚拟列表对象复用，不可闭包捕获
     * 渲染时的 index）。
     * 必须在 setItems 之前调用；替换 handler 不追溯已注册对象（已注册对象
     * 仍走注册时的 handler）。
     */
    setItemClick(handler: (index: number, item: T) => void): void;
    /**
     * 强制刷新可视项渲染（包装 GList.refreshVirtualList）。数据内容变化但长度
     * 不变时（如单项状态翻转）调用，确保 itemRenderer 重跑；部分引擎的 numItems
     * setter 在值相同时可能短路不触发重绘，显式 refresh 消除该隐式依赖。
     */
    refresh(): void;
}
