import type { IViewModelNode } from "./IViewModelNode";

/**
 * 单个列表项的可读写视图：根数据 + 按字段名解析 item 内子节点。
 * 引擎无关：渲染器/游戏层消费它驱动 fgui 虚拟列表，不接触 fgui 类型。
 */
export interface IFairyGuiListItemView<T> {
    readonly index: number;
    readonly item: T;
    /** 解析 item 内子节点；节点不存在返回 undefined（对齐未知节点容错）。 */
    field(name: string): IViewModelNode | undefined;
}
