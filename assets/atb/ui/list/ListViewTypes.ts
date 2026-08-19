/**
 * ListView 组件共享类型与常量。
 * 事件名/方向枚举在本文件归口（字符串归口约定）：消费方禁止裸写事件字符串。
 */

/** 滚动主轴方向。数值型枚举对象供 cc Enum 编辑器下拉使用。 */
export const ListViewDirection = {
    Vertical: 0,
    Horizontal: 1,
} as const;
export type ListViewDirection = (typeof ListViewDirection)[keyof typeof ListViewDirection];

/** ListView 在组件所在节点上 emit 的事件名。 */
export const ListViewEvent = {
    /** item 点击；参数 (index: number, data: unknown)。 */
    ItemClick: "atb-listview-item-click",
    /** 滚动触底（SCROLL_ENDED 且主轴偏移达上限）；无参数。 */
    ScrollToEnd: "atb-listview-scroll-to-end",
} as const;
export type ListViewEvent = (typeof ListViewEvent)[keyof typeof ListViewEvent];

/** item 组件契约：数据绑定与回收清理，由 ListViewItem（或其子类）实现。 */
export interface IListViewItem {
    /** 绑定数据与索引：子类在此刷新内容展示。 */
    bind(data: unknown, index: number): void;
    /** 回收前清理：解监听、复位状态。 */
    unbind(): void;
}
