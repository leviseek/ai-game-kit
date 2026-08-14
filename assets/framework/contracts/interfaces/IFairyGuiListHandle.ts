import type { IFairyGuiListItemView } from "./IFairyGuiListItemView";

/**
 * 引擎无关列表句柄：设置数据、渲染回调与点击回调。
 * 装配时序：setItemRenderer / setItemClick 必须先于 setItems 调用（渲染与
 * 点击注册都在 itemRenderer 对可视项调用时发生），随后反复 setItems 驱动数据。
 */
export interface IFairyGuiListHandle<T> {
    /**
     * 更新列表数据并驱动 numItems（触发 itemRenderer 渲染可视项）。必须在
     * setItemRenderer / setItemClick 之后调用，否则已渲染对象不补注册回调。
     */
    setItems(items: readonly T[]): void;
    /**
     * 设置 item 渲染回调：适配层对每个可视 item 对象调用一次渲染器。
     * 必须在 setItems 之前调用；替换 renderer 不追溯已渲染对象。
     */
    setItemRenderer(renderer: (view: IFairyGuiListItemView<T>) => void): void;
    /**
     * 设置 item 点击回调：适配层对每个 item 对象去重注册一次点击，点击时
     * 动态解析该对象当前 index 对应的 item（虚拟列表对象复用，不可闭包捕获
     * 渲染时的 index）。
     * 必须在 setItems 之前调用；替换 handler 不追溯已注册对象（已注册对象
     * 仍走注册时的 handler）。
     */
    setItemClick(handler: (index: number, item: T) => void): void;
    /**
     * 强制刷新可视项渲染。数据内容变化但长度不变时（如单项状态翻转）调用，
     * 确保 itemRenderer 重跑。实现经重设 numItems 达成（非虚拟列表 setter 在
     * 值相同时仍无条件重跑 itemRenderer），对虚拟与非虚拟列表均安全。
     */
    refresh(): void;
}
