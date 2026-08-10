import { Event, GComponent, GList, GObject } from "fairygui-cc";
import type {
    FairyGuiListItemView,
    FairyGuiListHandle,
} from "../../../contracts/ui/List";
import { wrapFairyGuiObject } from "./FairyGuiViewHandle";

/**
 * 把 fgui GList 包装为引擎无关 FairyGuiListHandle。itemRenderer 内把每个
 * item 对象包装为 FairyGuiListItemView（field 解析 item 内子节点），并把
 * 该对象的当前 index 记录到 WeakMap；点击回调去重注册一次，触发时按对象
 * 当前 index 动态解析 item（虚拟列表对象复用，滚动后 index 变化仍正确）。
 * fgui 类型只存在于本 Adapter 边界；渲染器/游戏层只消费 FairyGuiListHandle
 * 契约。
 */
export function createFairyGuiListHandle<T>(list: GList): FairyGuiListHandle<T> {
    let items: readonly T[] = [];
    let renderer: ((view: FairyGuiListItemView<T>) => void) | undefined;
    let clickHandler: ((index: number, item: T) => void) | undefined;
    // 对象 → 当前 index：itemRenderer 每次渲染更新，点击时动态读取
    const objIndex = new WeakMap<GObject, number>();
    // 已注册点击的 item 对象集合：虚拟列表复用对象，避免重复注册监听
    const registeredClick = new Set<GObject>();

    list.itemRenderer = (index: number, obj: GObject): void => {
        objIndex.set(obj, index);
        const item = items[index];
        if (item === undefined) {
            return;
        }
        renderer?.({
            index,
            item,
            field: (name: string) => {
                const child = (obj as GComponent).getChild(name);
                return child === null ? undefined : wrapFairyGuiObject(child);
            },
        });
        if (clickHandler !== undefined && !registeredClick.has(obj)) {
            registeredClick.add(obj);
            // 捕获当前回调：闭包不保留可再赋值 let 变量的收窄，需固定引用
            const handleClick = clickHandler;
            obj.on(Event.CLICK, () => {
                const currentIndex = objIndex.get(obj);
                const currentItem =
                    currentIndex === undefined ? undefined : items[currentIndex];
                if (currentIndex !== undefined && currentItem !== undefined) {
                    handleClick(currentIndex, currentItem);
                }
            }, obj);
        }
    };

    return {
        setItems(next: readonly T[]): void {
            items = next;
            list.numItems = next.length;
        },
        setItemRenderer(next: (view: FairyGuiListItemView<T>) => void): void {
            renderer = next;
        },
        setItemClick(next: (index: number, item: T) => void): void {
            clickHandler = next;
        },
    };
}

/**
 * 视图节点接缝：包装 fgui 页面根组件按名解析 GList 并暴露 FairyGuiListHandle。
 * 节点不是 GList 或不存在时返回 undefined（渲染器按契约跳过该绑定）。
 */
export function createFairyGuiListViewHandle(
    view: GComponent,
): (name: string) => FairyGuiListHandle<unknown> | undefined {
    return (name: string): FairyGuiListHandle<unknown> | undefined => {
        const child = view.getChild(name);
        if (child === null || !(child instanceof GList)) {
            return undefined;
        }
        return createFairyGuiListHandle<unknown>(child);
    };
}
