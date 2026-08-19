import { _decorator, Component } from "cc";
import type { IListViewItem } from "./ListViewTypes";

const { ccclass } = _decorator;

/**
 * ListView item 基类组件：挂在 item 模板节点上，由 ListView 驱动 bind/unbind。
 * 业务 item 继承本类并覆写 onBind/onUnbind；经 data/index 只读访问当前绑定。
 */
@ccclass("ListViewItem")
export class ListViewItem extends Component implements IListViewItem {
    private _data: unknown = null;
    private _index = -1;

    /** 当前绑定的数据；未绑定时为 null。 */
    public get data(): unknown {
        return this._data;
    }

    /** 当前绑定的数据索引；未绑定时为 -1。 */
    public get index(): number {
        return this._index;
    }

    public bind(data: unknown, index: number): void {
        this._data = data;
        this._index = index;
        this.onBind(data, index);
    }

    public unbind(): void {
        this.onUnbind();
        this._data = null;
        this._index = -1;
    }

    /** 子类覆写：数据绑定时刷新内容展示。 */
    protected onBind(_data: unknown, _index: number): void {}

    /** 子类覆写：回收前清理（解监听、复位状态）。 */
    protected onUnbind(): void {}
}
