import { Component, Enum, EventTouch, Node, ScrollView, UITransform, Vec2, _decorator, instantiate } from "cc";
import { ListViewItem } from "./ListViewItem";
import { createListViewLayout, type ListViewLayout } from "./ListViewLayout";
import { createListViewPool, type ListViewPool, type ListViewPoolRecord } from "./ListViewPool";
import { ListViewDirection, ListViewEvent } from "./ListViewTypes";
const { ccclass, property } = _decorator;
/** 可见槽位：池内记录（原样归还）+ item 节点与其上的 ListViewItem 组件。 */
interface VisibleEntry {
    readonly record: ListViewPoolRecord<Node>;
    readonly node: Node;
    readonly item: ListViewItem;
}
/**
 * ListView：基于 Cocos 原生 ScrollView 的数据驱动虚拟列表（v1 单模板、等尺寸）。
 * 组件只管理主轴：item 主轴位置由本组件计算，交叉轴位置/锚点由模板决定；content
 * 主轴尺寸由本组件维护。场景结构：组件节点（或其下 ScrollView 节点）挂 ScrollView
 * （view + content 子树）与 itemTemplate（active=false，须挂 ListViewItem 子类）。
 * content 主轴锚点任意（位置计算已按锚点换算）；item 建议主轴起点侧锚点。
 */
@ccclass("ListView")
export class ListView extends Component {
    private static readonly TEMPLATE_ID = "default";
    @property(ScrollView)
    scrollView: ScrollView | null = null;
    /** 列表内容节点（ScrollView.content）。 */
    @property(Node)
    content: Node | null = null;
    /** item 模板节点（active=false），须挂 ListViewItem（或子类）组件。 */
    @property(Node)
    itemTemplate: Node | null = null;
    @property({ type: Enum(ListViewDirection), tooltip: "滚动主轴方向" })
    direction: ListViewDirection = ListViewDirection.Vertical;
    /** item 主轴尺寸（必须 > 0）。 */
    @property
    itemSize = 100;
    /** item 主轴间距（>= 0）。 */
    @property
    spacing = 0;
    /** 可见区外预渲染缓冲（主轴像素），防滚动抖动。 */
    @property
    buffer = 100;
    /** scrollToIndex 平滑滚动时长（秒）；0 为立即定位。 */
    @property
    scrollDuration = 0.2;
    /** item 点击回调（经 content 触摸事件委托触发）。 */
    onItemClick: ((index: number, data: unknown) => void) | null = null;
    /** 滚动触底回调（SCROLL_ENDED 且主轴偏移达上限）。 */
    onScrollToEnd: (() => void) | null = null;
    private _items: unknown[] = [];
    private _dirty = false;
    private _wired = false;
    private _layout: ListViewLayout | null = null;
    private _pool: ListViewPool<Node> | null = null;
    private _visible = new Map<number, VisibleEntry>();
    private _nodeIndex = new Map<Node, number>();
    onLoad(): void {
        if (this.scrollView === null || this.content === null || this.itemTemplate === null) {
            console.warn(`[ListView] scrollView/content/itemTemplate 未全部接线，组件停用: ${this.node.name}`);
            return;
        }
        if (this.itemTemplate.getComponent(ListViewItem) === null) {
            console.warn(`[ListView] itemTemplate 缺少 ListViewItem 组件: ${this.itemTemplate.name}`);
            return;
        }
        if (this.itemSize <= 0 || this.spacing < 0 || this.buffer < 0) {
            console.warn(`[ListView] itemSize 必须 > 0，spacing/buffer 必须 >= 0: ${this.node.name}`);
            return;
        }
        this._layout = createListViewLayout({
            direction: this.direction,
            itemSize: this.itemSize,
            spacing: this.spacing,
            buffer: this.buffer,
        });
        // 池容量按可见数上限 + 双缓冲余量估算；超出容量的获取会经框架对象池上报溢出
        const capacity = Math.ceil((this.viewportSize() + 2 * this.buffer) / this._layout.stride) + 2;
        this._pool = createListViewPool<Node>({
            capacityPerTemplate: capacity,
            createNode: () => this.createItemNode(),
            resetNode: (node) => {
                node.active = false;
            },
        });
        this.scrollView.node.on(ScrollView.EventType.SCROLLING, this.onScrolling, this);
        this.scrollView.node.on(ScrollView.EventType.SCROLL_ENDED, this.onScrollEnded, this);
        this.content.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this._wired = true;
    }
    /** item 节点工厂接缝：缺省实例化模板；测试可覆写注入受控节点。 */
    protected createItemNode(): Node {
        const template = this.itemTemplate;
        if (template === null) {
            throw new Error("ListView itemTemplate is not wired");
        }
        return instantiate(template);
    }
    lateUpdate(): void {
        if (!this._dirty || !this._wired) {
            return;
        }
        this._dirty = false;
        this.rebuild();
    }
    /** 设置数据并标记重建；同帧多次调用合并为一次重建（脏标记收敛）。 */
    setItems<T>(items: readonly T[]): void {
        this._items = items.slice();
        this._dirty = true;
    }
    /** 重绑全部可见项（不重建节点、不重算区间）；setItems 的 rebuild 内部也会执行同等重绑。 */
    refresh(): void {
        for (const [index, entry] of this._visible) {
            if (index < this._items.length) {
                entry.item.unbind();
                entry.item.bind(this._items[index], index);
            }
        }
    }
    /** 滚动到指定索引：item 中心对齐视口中心；越界索引钳制。 */
    scrollToIndex(index: number): void {
        const scrollView = this.scrollView;
        const layout = this._layout;
        if (scrollView === null || layout === null) {
            return;
        }
        const count = this._items.length;
        if (count === 0) {
            return;
        }
        const targetIndex = Math.min(Math.max(index, 0), count - 1);
        const viewport = this.viewportSize();
        const main = layout.itemPosition(targetIndex) + layout.itemSize / 2 - viewport / 2;
        scrollView.scrollToOffset(this.offsetFromMain(layout.clampOffset(main, count, viewport)), this.scrollDuration, false);
    }
    private rebuild(): void {
        const layout = this._layout;
        const scrollView = this.scrollView;
        if (layout === null || scrollView === null) {
            return;
        }
        this.setContentSize(layout.contentSize(this._items.length));
        // setItems 语义是全量刷新：先重绑可见项（数量不变时也能看到新数据），再同步区间
        this.refresh();
        this.syncVisibleItems();
        this.clampIfOutOfRange();
    }
    /** 更新 content 主轴尺寸（交叉轴尺寸保持不变）。 */
    private setContentSize(total: number): void {
        const ut = this.content?.getComponent(UITransform);
        if (ut === null || ut === undefined) {
            return;
        }
        if (this.direction === ListViewDirection.Vertical) {
            ut.setContentSize(ut.width, total);
        } else {
            ut.setContentSize(total, ut.height);
        }
    }
    /** 视口主轴尺寸：读 ScrollView 所在节点 UITransform（未挂时读本组件节点）。 */
    private viewportSize(): number {
        const host = this.scrollView !== null ? this.scrollView.node : this.node;
        const ut = host.getComponent(UITransform);
        if (ut === null || ut === undefined) {
            return 0;
        }
        return this.direction === ListViewDirection.Vertical ? ut.height : ut.width;
    }
    /** 引擎滚动偏移 → 主轴偏移（从内容起点起算）。 */
    private mainAxisOffset(): number {
        const offset = this.scrollView?.getScrollOffset();
        return offset === undefined ? 0 : this.direction === ListViewDirection.Vertical ? offset.y : offset.x;
    }
    /** 主轴偏移 → 引擎滚动偏移（保持交叉轴当前值）。 */
    private offsetFromMain(main: number): Vec2 {
        const current = this.scrollView?.getScrollOffset() ?? new Vec2(0, 0);
        return this.direction === ListViewDirection.Vertical ? new Vec2(current.x, main) : new Vec2(main, current.y);
    }
    /** 按当前偏移同步可见区间：回收区间外、补齐区间内。 */
    private syncVisibleItems(): void {
        const layout = this._layout;
        if (layout === null) {
            return;
        }
        const count = this._items.length;
        const range = layout.visibleRange(this.mainAxisOffset(), this.viewportSize(), count);
        for (const [index, entry] of Array.from(this._visible)) {
            if (index < range.first || index > range.last) {
                this.releaseEntry(index, entry);
            }
        }
        for (let index = range.first; index <= range.last; index++) {
            if (!this._visible.has(index)) {
                this.acquireEntry(index);
            }
        }
    }
    private acquireEntry(index: number): void {
        const pool = this._pool;
        if (pool === null) {
            return;
        }
        const record = pool.acquire(ListView.TEMPLATE_ID);
        const item = record.node.getComponent(ListViewItem);
        if (item === null) {
            // 模板缺 ListViewItem 已在 onLoad 拦截；此处兜底归还，避免节点泄漏
            pool.release(record);
            return;
        }
        this.content?.addChild(record.node); // instantiate 产物脱离场景树，须挂树才参与渲染
        record.node.active = true;
        this.positionNode(record.node, index);
        item.bind(this._items[index], index);
        this._visible.set(index, { record, node: record.node, item });
        this._nodeIndex.set(record.node, index);
    }
    private releaseEntry(index: number, entry: VisibleEntry): void {
        entry.item.unbind();
        entry.node.removeFromParent();
        entry.node.active = false;
        this._nodeIndex.delete(entry.node);
        this._visible.delete(index);
        this._pool?.release(entry.record); // 原样归还：显式所有者池按对象身份校验，新建记录会被拒绝
    }
    /** 主轴定位：按 content 锚点换算，使首项主轴起点对齐内容起点。 */
    private positionNode(node: Node, index: number): void {
        const layout = this._layout;
        if (layout === null) {
            return;
        }
        const pos = layout.itemPosition(index);
        const p = node.getPosition();
        const ut = this.content?.getComponent(UITransform);
        if (this.direction === ListViewDirection.Vertical) {
            const top = ut === null || ut === undefined ? 0 : (1 - ut.anchorY) * ut.height;
            node.setPosition(p.x, top - pos, p.z);
        } else {
            const left = ut === null || ut === undefined ? 0 : ut.anchorX * ut.width;
            node.setPosition(left + pos, p.y, p.z);
        }
    }
    /** 内容缩小导致偏移越界时，钳回合法范围（引擎静止时不会自动钳制）。 */
    private clampIfOutOfRange(): void {
        const layout = this._layout;
        const scrollView = this.scrollView;
        if (layout === null || scrollView === null) {
            return;
        }
        const max = layout.clampOffset(this.mainAxisOffset(), this._items.length, this.viewportSize());
        if (this.mainAxisOffset() > max + 0.01) {
            scrollView.scrollToOffset(this.offsetFromMain(max), 0, false);
        }
    }
    private onScrolling(): void {
        this.syncVisibleItems();
    }
    private onScrollEnded(): void {
        this.syncVisibleItems();
        this.detectScrollToEnd();
    }
    /** 主轴偏移达到滚动上限（容差 1px）时触发触底回调与事件；空列表不触发。 */
    private detectScrollToEnd(): void {
        const scrollView = this.scrollView;
        if (scrollView === null || this._items.length === 0) {
            return;
        }
        const max = scrollView.getMaxScrollOffset();
        const current = scrollView.getScrollOffset();
        const reached =
            this.direction === ListViewDirection.Vertical ? current.y >= max.y - 1 : current.x >= max.x - 1;
        if (reached) {
            this.onScrollToEnd?.();
            this.node.emit(ListViewEvent.ScrollToEnd);
        }
    }
    /** content 触摸事件委托：沿 target 父链找可见 item 节点，派发点击。 */
    private onTouchEnd(event: EventTouch): void {
        let node: Node | null = event.target;
        while (node !== null) {
            const index = this._nodeIndex.get(node);
            if (index !== undefined) {
                const data = this._items[index];
                this.onItemClick?.(index, data);
                this.node.emit(ListViewEvent.ItemClick, index, data);
                return;
            }
            node = node.parent;
        }
    }
    onDestroy(): void {
        this.scrollView?.node.off(ScrollView.EventType.SCROLLING, this.onScrolling, this);
        this.scrollView?.node.off(ScrollView.EventType.SCROLL_ENDED, this.onScrollEnded, this);
        this.content?.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        for (const [index, entry] of Array.from(this._visible)) {
            this.releaseEntry(index, entry);
        }
        this._pool?.dispose();
        this._pool = null;
        this._wired = false;
    }
}
