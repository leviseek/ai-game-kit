import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, mock, spyOn, test } from "bun:test";

import { createCcMock } from "./helpers/cc-mock";
import { ListViewDirection, ListViewEvent } from "../../../assets/atb/ui/list/ListViewTypes";

// cc mock 先行注册：组件文件 import "cc" 时解析到共享桩（与其它 mock cc 的测试对齐）
mock.module("cc", () => createCcMock());

interface FakeUiTransform {
    width: number;
    height: number;
    anchorX: number;
    anchorY: number;
    setContentSize(width: number, height: number): void;
}

interface FakeNode {
    name: string;
    parent: FakeNode | null;
    active: boolean;
    position: { x: number; y: number; z: number };
    children: FakeNode[];
    components: Map<unknown, unknown>;
    listeners: Map<string, Array<{ callback: (...args: unknown[]) => void; target: unknown }>>;
    emits: Array<{ type: string; args: unknown[] }>;
    on(type: string, callback: (...args: unknown[]) => void, target?: unknown): void;
    off(type: string, callback: (...args: unknown[]) => void, target?: unknown): void;
    emit(type: string, ...args: unknown[]): void;
    getPosition(): { x: number; y: number; z: number };
    setPosition(x: number, y: number, z?: number): void;
    getComponent(ctor: unknown): unknown;
    addChild(child: FakeNode): void;
    removeFromParent(): void;
}

interface ScrollCall {
    readonly offset: { x: number; y: number };
    readonly time: number;
    readonly attenuated: boolean;
}

interface FakeScrollView {
    node: FakeNode;
    offset: { x: number; y: number };
    maxOffset: { x: number; y: number };
    scrollCalls: ScrollCall[];
    getScrollOffset(): { x: number; y: number };
    getMaxScrollOffset(): { x: number; y: number };
    scrollToOffset(offset: { x: number; y: number }, time?: number, attenuated?: boolean): void;
}

interface ListViewInstance {
    node: FakeNode;
    scrollView: FakeScrollView | null;
    content: FakeNode | null;
    itemTemplate: FakeNode | null;
    direction: number;
    itemSize: number;
    spacing: number;
    buffer: number;
    scrollDuration: number;
    onItemClick: ((index: number, data: unknown) => void) | null;
    onScrollToEnd: (() => void) | null;
    onLoad(): void;
    lateUpdate(): void;
    onDestroy(): void;
    setItems<T>(items: readonly T[]): void;
    refresh(): void;
    scrollToIndex(index: number): void;
}

interface ListViewItemInstance {
    data: unknown;
    index: number;
    bind(data: unknown, index: number): void;
    unbind(): void;
}

interface SpyItemInstance extends ListViewItemInstance {
    readonly binds: Array<{ data: unknown; index: number }>;
    unbindCount: number;
}

interface TestListViewInstance extends ListViewInstance {
    readonly created: FakeNode[];
}

type ListViewCtor = new () => ListViewInstance;
type ListViewItemCtor = new () => ListViewItemInstance;
type SpyItemCtor = new () => SpyItemInstance;
type TestListViewCtor = new (makeItem: () => SpyItemInstance) => TestListViewInstance;

let ListView: ListViewCtor;
let ListViewItem: ListViewItemCtor;
let UITransform: unknown;
let NodeEventType: Record<string, string>;
let ScrollViewEventType: Record<string, string>;
let SpyItem: SpyItemCtor;
let TestListView: TestListViewCtor;

const projectRoot = resolve(import.meta.dir, "../../..");
const listViewFile = resolve(projectRoot, "assets/atb/ui/list/ListView.ts");
const listViewItemFile = resolve(projectRoot, "assets/atb/ui/list/ListViewItem.ts");

beforeAll(async () => {
    const listViewModule = (await import(pathToFileURL(listViewFile).href)) as { ListView: ListViewCtor };
    ListView = listViewModule.ListView;
    const itemModule = (await import(pathToFileURL(listViewItemFile).href)) as { ListViewItem: ListViewItemCtor };
    ListViewItem = itemModule.ListViewItem;
    // "cc" 经 mock.module 解析到共享桩，此处取回类引用用于 getComponent 键与事件常量
    const cc = (await import("cc")) as Record<string, unknown>;
    UITransform = cc.UITransform;
    NodeEventType = (cc.Node as { EventType: Record<string, string> }).EventType;
    ScrollViewEventType = (cc.ScrollView as { EventType: Record<string, string> }).EventType;
    SpyItem = class SpyItem extends ListViewItem {
        readonly binds: Array<{ data: unknown; index: number }> = [];
        unbindCount = 0;
        protected onBind(data: unknown, index: number): void {
            this.binds.push({ data, index });
        }
        protected onUnbind(): void {
            this.unbindCount += 1;
        }
    };
    TestListView = class TestListView extends ListView {
        readonly created: FakeNode[] = [];
        constructor(private readonly makeItem: () => SpyItemInstance) {
            super();
        }
        protected createItemNode(): FakeNode {
            const node = makeFakeNode("item");
            node.components.set(ListViewItem, this.makeItem());
            this.created.push(node);
            return node;
        }
    };
});

function makeFakeNode(name: string): FakeNode {
    const node: FakeNode = {
        name,
        parent: null,
        active: true,
        position: { x: 0, y: 0, z: 0 },
        children: [],
        components: new Map(),
        listeners: new Map(),
        emits: [],
        on(type, callback, target) {
            let list = node.listeners.get(type);
            if (list === undefined) {
                list = [];
                node.listeners.set(type, list);
            }
            list.push({ callback, target });
        },
        off(type, callback, target) {
            const list = node.listeners.get(type);
            if (list === undefined) {
                return;
            }
            node.listeners.set(
                type,
                list.filter((entry) => !(entry.callback === callback && entry.target === target)),
            );
        },
        emit(type, ...args) {
            node.emits.push({ type, args });
            for (const entry of node.listeners.get(type) ?? []) {
                entry.callback.call(entry.target, ...args);
            }
        },
        getPosition() {
            return { ...node.position };
        },
        setPosition(x, y, z) {
            node.position = { x, y, z: z ?? 0 };
        },
        getComponent(ctor) {
            return node.components.get(ctor) ?? null;
        },
        addChild(child) {
            child.parent = node;
            node.children.push(child);
        },
        removeFromParent() {
            if (node.parent === null) {
                return;
            }
            const parent = node.parent;
            node.parent = null;
            parent.children = parent.children.filter((child) => child !== node);
        },
    };
    return node;
}

function makeScrollView(options: { offsetY?: number; maxY?: number }): FakeScrollView {
    const node = makeFakeNode("scrollView");
    const sv: FakeScrollView = {
        node,
        offset: { x: 0, y: options.offsetY ?? 0 },
        maxOffset: { x: 0, y: options.maxY ?? 0 },
        scrollCalls: [],
        getScrollOffset() {
            return { ...sv.offset };
        },
        getMaxScrollOffset() {
            return { ...sv.maxOffset };
        },
        scrollToOffset(offset, time, attenuated) {
            sv.scrollCalls.push({ offset: { ...offset }, time: time ?? 0, attenuated: attenuated ?? false });
            sv.offset = { x: offset.x, y: offset.y };
        },
    };
    return sv;
}

function makeHarness(options: { offsetY?: number; maxY?: number; buffer?: number; direction?: number } = {}): {
    list: TestListViewInstance;
    sv: FakeScrollView;
    content: FakeNode;
    contentUt: FakeUiTransform;
    listNode: FakeNode;
    spies: SpyItemInstance[];
    created: FakeNode[];
} {
    const sv = makeScrollView({ offsetY: options.offsetY, maxY: options.maxY });
    sv.node.components.set(UITransform, { width: 300, height: 250, anchorX: 0.5, anchorY: 0.5, setContentSize() {} });
    const content = makeFakeNode("content");
    // 主轴锚点按方向取起点侧（vertical → anchorY=1，horizontal → anchorX=0）
    const contentUt: FakeUiTransform =
        options.direction === ListViewDirection.Horizontal
            ? {
                  width: 300,
                  height: 250,
                  anchorX: 0,
                  anchorY: 0.5,
                  setContentSize(w, h) {
                      this.width = w;
                      this.height = h;
                  },
              }
            : {
                  width: 300,
                  height: 250,
                  anchorX: 0.5,
                  anchorY: 1,
                  setContentSize(w, h) {
                      this.width = w;
                      this.height = h;
                  },
              };
    content.components.set(UITransform, contentUt);
    const template = makeFakeNode("template");
    template.active = false;
    template.components.set(ListViewItem, new SpyItem());
    const listNode = makeFakeNode("list");
    const spies: SpyItemInstance[] = [];
    const list = new TestListView(() => {
        const spy = new SpyItem();
        spies.push(spy);
        return spy;
    });
    list.node = listNode;
    list.scrollView = sv;
    list.content = content;
    list.itemTemplate = template;
    list.direction = options.direction ?? ListViewDirection.Vertical;
    list.itemSize = 100;
    list.spacing = 0;
    list.buffer = options.buffer ?? 0;
    list.onLoad();
    return { list, sv, content, contentUt, listNode, spies, created: list.created };
}

function visibleOf(list: TestListViewInstance): Map<number, { node: FakeNode; item: SpyItemInstance }> {
    return (list as unknown as { _visible: Map<number, { node: FakeNode; item: SpyItemInstance }> })._visible;
}

describe("ListView 组件", () => {
    test("setItems 后 lateUpdate 重建：content 尺寸、可见项与主轴位置正确", () => {
        const h = makeHarness({});
        h.list.setItems(["a", "b", "c", "d", "e", "f"]);
        h.list.lateUpdate();
        expect(h.contentUt.height).toBe(600); // 6 * itemSize
        const visible = visibleOf(h.list);
        expect(visible.size).toBe(3); // 视口 250 → [0, 2]
        expect(h.spies).toHaveLength(3);
        expect(h.spies[0].binds).toEqual([{ data: "a", index: 0 }]);
        expect(h.spies[2].binds).toEqual([{ data: "c", index: 2 }]);
        // content 锚点 (0.5, 1)：主轴 y = -index * itemSize
        expect(h.created[0].position.y).toBe(0);
        expect(h.created[2].position.y).toBe(-200);
        // 渲染前提：item 节点必须挂到 content 下
        for (const node of h.created) {
            expect(node.parent).toBe(h.content);
        }
        expect(h.content.children).toHaveLength(3);
    });

    test("滚动后区间平移：越界项回收入池、缺位项复用池内节点", () => {
        const h = makeHarness({ buffer: 100 });
        h.list.setItems(Array.from({ length: 12 }, (_, i) => i));
        h.list.lateUpdate();
        expect(h.created).toHaveLength(4); // 初始可见 [0, 3]
        h.sv.offset.y = 250;
        h.sv.node.emit(ScrollViewEventType.SCROLLING, h.sv);
        expect(Array.from(visibleOf(h.list).keys())).toEqual([1, 2, 3, 4, 5, 6]);
        expect(h.spies[0].unbindCount).toBe(1); // index 0 已回收
        expect(h.spies[0].binds).toEqual([
            { data: 0, index: 0 },
            { data: 4, index: 4 },
        ]); // 节点立即复用于 index 4
        h.sv.offset.y = 500;
        h.sv.node.emit(ScrollViewEventType.SCROLLING, h.sv);
        expect(Array.from(visibleOf(h.list).keys())).toEqual([3, 4, 5, 6, 7, 8]);
        // 池复用：index 7/8 复用回收的节点，不再新建（对象池后进先出：node2→7、node1→8）
        expect(h.created).toHaveLength(6);
        expect(h.spies[1].binds).toEqual([
            { data: 1, index: 1 },
            { data: 8, index: 8 },
        ]);
        expect(h.created[5].position.y).toBe(-600); // index 6 新建节点
        expect(h.created[2].position.y).toBe(-700); // 复用节点重新定位到 index 7
        // 6 个节点全部在可见区间内（池复用保持可见集），都挂在 content 下
        expect(h.content.children).toHaveLength(6);
        for (const node of h.created) {
            expect(node.parent).toBe(h.content);
        }
    });

    test("空数据：content 尺寸 0、无可见项、无节点创建", () => {
        const h = makeHarness({});
        h.list.setItems([]);
        h.list.lateUpdate();
        expect(h.contentUt.height).toBe(0);
        expect(visibleOf(h.list).size).toBe(0);
        expect(h.created).toHaveLength(0);
    });

    test("同帧多次 setItems 合并为一次重建", () => {
        const h = makeHarness({});
        h.list.setItems(["a", "b", "c"]);
        h.list.setItems(["1", "2", "3", "4", "5"]);
        h.list.lateUpdate();
        expect(h.spies).toHaveLength(3); // 只按最终数据建可见项
        expect(h.spies[0].binds).toEqual([{ data: "1", index: 0 }]);
    });

    test("refresh 仅重绑可见项，不重建节点", () => {
        const h = makeHarness({});
        h.list.setItems(["a", "b", "c"]);
        h.list.lateUpdate();
        const created = h.created.length;
        h.list.setItems(["x", "y", "z"]);
        h.list.refresh();
        expect(h.created.length).toBe(created);
        expect(h.spies[0].binds).toEqual([
            { data: "a", index: 0 },
            { data: "x", index: 0 },
        ]);
    });

    test("再次 setItems：同数量数据时可见项重新绑定（内容刷新）", () => {
        const h = makeHarness({});
        h.list.setItems(["a", "b", "c"]);
        h.list.lateUpdate();
        h.list.setItems(["x", "y", "z"]);
        h.list.lateUpdate();
        expect(h.spies[0].binds).toEqual([
            { data: "a", index: 0 },
            { data: "x", index: 0 },
        ]);
        expect(h.spies[2].binds).toEqual([
            { data: "c", index: 2 },
            { data: "z", index: 2 },
        ]);
        expect(h.created).toHaveLength(3); // 节点复用，无新建
        // 数量变化时同样刷新正确
        h.list.setItems(["1", "2", "3", "4"]);
        h.list.lateUpdate();
        expect(h.spies[0].binds.at(-1)).toEqual({ data: "1", index: 0 });
        expect(Array.from(visibleOf(h.list).keys())).toEqual([0, 1, 2]); // 视口 250 → 仍 3 项可见
        expect(h.content.children).toHaveLength(3);
    });

    test("scrollToIndex：计算目标偏移并调用引擎滚动，越界索引钳制", () => {
        const h = makeHarness({});
        h.list.setItems(Array.from({ length: 12 }, (_, i) => i));
        h.list.lateUpdate();
        h.list.scrollToIndex(5);
        expect(h.sv.scrollCalls).toHaveLength(1);
        // 起点 500 + 半高 50 - 半视口 125 = 425；上限 max(0, 1200 - 250) = 950
        expect(h.sv.scrollCalls[0].offset.y).toBe(425);
        expect(h.sv.scrollCalls[0].time).toBe(0.2);
        h.list.scrollToIndex(99); // 越界 → 钳到末项
        expect(h.sv.scrollCalls[1].offset.y).toBe(950);
    });

    test("item 点击委托：命中可见项（含嵌套子节点）派发回调与事件", () => {
        const h = makeHarness({});
        const clicks: Array<[number, unknown]> = [];
        h.list.onItemClick = (index, data) => clicks.push([index, data]);
        h.list.setItems(["a", "b", "c"]);
        h.list.lateUpdate();
        h.content.emit(NodeEventType.TOUCH_END, { target: h.created[1] });
        expect(clicks).toEqual([[1, "b"]]);
        expect(h.listNode.emits.some((e) => e.type === ListViewEvent.ItemClick && e.args[0] === 1)).toBe(true);
        const child = makeFakeNode("child");
        child.parent = h.created[0];
        h.content.emit(NodeEventType.TOUCH_END, { target: child });
        expect(clicks).toEqual([
            [1, "b"],
            [0, "a"],
        ]);
    });

    test("滚动触底：偏移达上限触发回调与事件；未达上限/空列表不触发", () => {
        const h = makeHarness({});
        let fired = 0;
        h.list.onScrollToEnd = () => {
            fired += 1;
        };
        h.list.setItems(Array.from({ length: 12 }, (_, i) => i));
        h.list.lateUpdate();
        h.sv.maxOffset.y = 950;
        h.sv.offset.y = 100;
        h.sv.node.emit(ScrollViewEventType.SCROLL_ENDED, h.sv);
        expect(fired).toBe(0);
        h.sv.offset.y = 950;
        h.sv.node.emit(ScrollViewEventType.SCROLL_ENDED, h.sv);
        expect(fired).toBe(1);
        expect(h.listNode.emits.some((e) => e.type === ListViewEvent.ScrollToEnd)).toBe(true);
        h.list.setItems([]);
        h.list.lateUpdate();
        h.sv.offset.y = 0;
        h.sv.node.emit(ScrollViewEventType.SCROLL_ENDED, h.sv);
        expect(fired).toBe(1); // 空列表不触发
    });

    test("onDestroy：回收全部可见项、退订事件、释放池", () => {
        const h = makeHarness({});
        h.list.setItems(["a", "b", "c"]);
        h.list.lateUpdate();
        h.list.onDestroy();
        expect(visibleOf(h.list).size).toBe(0);
        for (const node of h.created) {
            expect(node.active).toBe(false);
            expect(node.parent).toBeNull(); // 已移出 content
        }
        expect(h.content.children).toHaveLength(0);
        expect((h.list as unknown as { _pool: unknown })._pool).toBeNull();
        expect(h.sv.node.listeners.get(ScrollViewEventType.SCROLLING) ?? []).toHaveLength(0);
        expect(h.content.listeners.get(NodeEventType.TOUCH_END) ?? []).toHaveLength(0);
    });

    test("未接线时 onLoad 停用并告警，不崩溃", () => {
        const warn = spyOn(console, "warn");
        try {
            const list = new ListView();
            list.node = makeFakeNode("unwired");
            list.onLoad();
            list.setItems(["a"]);
            list.lateUpdate();
            expect(warn).toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });

    test("水平方向：content 宽度维护、item 主轴 x 定位", () => {
        const h = makeHarness({ direction: ListViewDirection.Horizontal });
        h.list.setItems(["a", "b", "c", "d", "e", "f"]);
        h.list.lateUpdate();
        expect(h.contentUt.width).toBe(600);
        expect(h.contentUt.height).toBe(250); // 交叉轴不动
        expect(h.created[1].position.x).toBe(100);
    });
});
