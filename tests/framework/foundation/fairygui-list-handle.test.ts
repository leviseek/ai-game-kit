import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

import { createFairyGuiMock } from "./helpers/fairygui-mock";

// 实现值 import fairygui-cc，统一使用共享 fixture 避免全量运行解析失败。
mock.module("fairygui-cc", () => createFairyGuiMock());

// ---- 接缝类型（契约快照，渲染器/游戏层只消费这些形状）----
interface IFairyGuiListItemView<T> {
    readonly index: number;
    readonly item: T;
    field(name: string): unknown;
}

interface IFairyGuiListHandle<T> {
    setItems(items: readonly T[]): void;
    setItemRenderer(renderer: (view: IFairyGuiListItemView<T>) => void): void;
    setItemClick(handler: (index: number, item: T) => void): void;
    refresh(): void;
}

interface FairyGuiListLike {
    name: string;
    itemRenderer: ((index: number, obj: unknown) => void) | null;
    numItems: number;
}

// ---- Adapter 契约（红期锁定，实现必须匹配）----
interface FairyGuiListHandleExports {
    readonly createFairyGuiListHandle?: (list: FairyGuiListLike) => IFairyGuiListHandle<unknown>;
    readonly createFairyGuiListViewHandle?: (view: unknown) => (name: string) => IFairyGuiListHandle<unknown> | undefined;
}

const projectRoot = resolve(import.meta.dir, "../../..");
const handleFile = resolve(projectRoot, "assets/framework/adapters/cocos/ui/FairyGuiListHandle.ts");

async function loadFactory(): Promise<FairyGuiListHandleExports> {
    const exports = (await import(pathToFileURL(handleFile).href)) as Partial<FairyGuiListHandleExports>;

    expect(typeof exports.createFairyGuiListHandle).toBe("function");

    return exports as FairyGuiListHandleExports;
}

/** 记录型 GList：暴露最小运行时（itemRenderer/numItems），手动驱动渲染。 */
function createListRecorder() {
    const renderedCalls: Array<{ index: number; obj: unknown }> = [];
    let numItemsValue = 0;
    let numItemsSets = 0;
    const list: FairyGuiListLike = {
        name: "candidate_list",
        itemRenderer: null,
        get numItems() {
            return numItemsValue;
        },
        // 模拟真实 GList setter：设置（含相同值）即认为触发一次渲染调度
        set numItems(value: number) {
            numItemsValue = value;
            numItemsSets += 1;
        },
    };
    return {
        list,
        // 由测试手动驱动渲染（模拟 fgui 对可视项调用 itemRenderer）
        render(index: number, obj: unknown): void {
            renderedCalls.push({ index, obj });
            list.itemRenderer?.(index, obj);
        },
        get renderedCount(): number {
            return renderedCalls.length;
        },
        get numItemsSets(): number {
            return numItemsSets;
        },
    };
}

/** 记录型 item 对象：捕获 on(CLICK) 注册次数与点击回调，供去重/动态 index 断言。 */
function createClickableItem(): {
    obj: unknown;
    clickCallbacks: (() => void)[];
    get clickRegistrations(): number;
} {
    const clickCallbacks: (() => void)[] = [];
    const counter = { value: 0 };
    const obj = {
        name: "item",
        on(_type: string, callback: () => void) {
            counter.value += 1;
            clickCallbacks.push(callback);
        },
    };
    return {
        obj,
        clickCallbacks,
        get clickRegistrations(): number {
            return counter.value;
        },
    };
}

describe("IFairyGuiListHandle", () => {
    test("setItems drives numItems", async () => {
        const factory = await loadFactory();
        const { list } = createListRecorder();
        const handle = factory.createFairyGuiListHandle!(list);

        handle.setItems(["a", "b", "c"]);
        expect(list.numItems).toBe(3);
        handle.setItems([]);
        expect(list.numItems).toBe(0);
    });

    test("refresh re-assigns numItems to force re-render", async () => {
        const factory = await loadFactory();
        const recorder = createListRecorder();
        const handle = factory.createFairyGuiListHandle!(recorder.list);

        handle.setItems(["a"]);
        expect(recorder.numItemsSets).toBe(1);
        handle.refresh();
        // 重设相同值仍触发一次 numItems 写入（非虚拟列表 itemRenderer 据此重跑）
        expect(recorder.numItemsSets).toBe(2);
        handle.refresh();
        expect(recorder.numItemsSets).toBe(3);
    });

    test("itemRenderer renders each visible item with dynamic index", async () => {
        const factory = await loadFactory();
        const recorder = createListRecorder();
        const handle = factory.createFairyGuiListHandle!(recorder.list);
        const rendered: Array<{ index: number; item: unknown }> = [];

        handle.setItemRenderer((view) => {
            rendered.push({ index: view.index, item: view.item });
        });
        handle.setItems(["a", "b", "c"]);

        const itemA = createClickableItem();
        const itemB = createClickableItem();
        recorder.render(0, itemA.obj);
        recorder.render(2, itemB.obj);

        expect(rendered).toEqual([
            { index: 0, item: "a" },
            { index: 2, item: "c" },
        ]);
    });

    test("itemRenderer guards undefined item without invoking renderer", async () => {
        const factory = await loadFactory();
        const recorder = createListRecorder();
        const handle = factory.createFairyGuiListHandle!(recorder.list);
        let renderCalls = 0;

        handle.setItemRenderer(() => {
            renderCalls += 1;
        });
        handle.setItems(["a", "b"]);

        const item = createClickableItem();
        recorder.render(5, item.obj);

        expect(renderCalls).toBe(0);
        expect(item.clickRegistrations).toBe(0);
    });

    test("item click is registered once per object (virtual list reuse)", async () => {
        const factory = await loadFactory();
        const recorder = createListRecorder();
        const handle = factory.createFairyGuiListHandle!(recorder.list);
        const clicks: Array<{ index: number; item: unknown }> = [];

        handle.setItemRenderer(() => {});
        handle.setItemClick((index, item) => {
            clicks.push({ index, item });
        });
        handle.setItems(["a", "b", "c"]);

        const item = createClickableItem();
        // 同一对象被复用渲染到多个 index，点击监听只注册一次
        recorder.render(0, item.obj);
        recorder.render(1, item.obj);
        recorder.render(2, item.obj);

        expect(item.clickRegistrations).toBe(1);
        expect(item.clickCallbacks).toHaveLength(1);

        // 触发点击：动态解析对象当前 index（复用后应为最后一次渲染位置）
        item.clickCallbacks[0]?.();
        expect(clicks).toEqual([{ index: 2, item: "c" }]);
    });

    test("item click resolves dynamic index after reuse (not captured at render)", async () => {
        const factory = await loadFactory();
        const recorder = createListRecorder();
        const handle = factory.createFairyGuiListHandle!(recorder.list);
        const clicks: Array<{ index: number; item: unknown }> = [];

        handle.setItemRenderer(() => {});
        handle.setItemClick((index, item) => {
            clicks.push({ index, item });
        });
        handle.setItems(["a", "b", "c"]);

        const item = createClickableItem();
        recorder.render(0, item.obj);
        item.clickCallbacks[0]?.();
        expect(clicks).toEqual([{ index: 0, item: "a" }]);

        // 对象复用后 index 变化，点击仍解析当前数据
        recorder.render(1, item.obj);
        item.clickCallbacks[0]?.();
        expect(clicks).toEqual([
            { index: 0, item: "a" },
            { index: 1, item: "b" },
        ]);
    });

    test("different item objects each register their own click", async () => {
        const factory = await loadFactory();
        const recorder = createListRecorder();
        const handle = factory.createFairyGuiListHandle!(recorder.list);
        const clicks: Array<{ index: number; item: unknown }> = [];

        handle.setItemRenderer(() => {});
        handle.setItemClick((index, item) => {
            clicks.push({ index, item });
        });
        handle.setItems(["a", "b"]);

        const itemA = createClickableItem();
        const itemB = createClickableItem();
        recorder.render(0, itemA.obj);
        recorder.render(1, itemB.obj);

        itemA.clickCallbacks[0]?.();
        itemB.clickCallbacks[0]?.();

        expect(clicks).toEqual([
            { index: 0, item: "a" },
            { index: 1, item: "b" },
        ]);
    });

    test("setItemClick before render registers click on next render", async () => {
        const factory = await loadFactory();
        const recorder = createListRecorder();
        const handle = factory.createFairyGuiListHandle!(recorder.list);

        handle.setItemRenderer(() => {});
        handle.setItems(["a", "b"]);
        const item = createClickableItem();
        recorder.render(0, item.obj);
        expect(item.clickRegistrations).toBe(0);

        // 设置点击后再渲染：该对象按去重集建立时未注册，后续渲染补注册
        handle.setItemClick(() => {});
        recorder.render(1, item.obj);
        expect(item.clickRegistrations).toBe(1);
    });

    test("createFairyGuiListViewHandle resolves GList by name and skips non-list children", async () => {
        const factory = await loadFactory();
        // 从 mock 后的模块取同一 GList class（adapter 经 instanceof 判定，需同一构造器）
        const { GList } = (await import("fairygui-cc")) as {
            GList: new () => FairyGuiListLike;
        };
        const list = new GList();
        const notAList = { name: "plain" };
        const children = new Map<string, unknown>([
            ["candidate_list", list],
            ["plain_child", notAList],
        ]);
        const view = {
            getChild(name: string) {
                return children.get(name) ?? null;
            },
        };

        const resolveList = factory.createFairyGuiListViewHandle!(view);
        const resolved = resolveList("candidate_list");
        expect(resolved).toBeDefined();
        expect(resolveList("missing")).toBeUndefined();
        expect(resolveList("plain_child")).toBeUndefined();
    });
});
