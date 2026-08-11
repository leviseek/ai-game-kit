import { Event, GComponent, GObject } from "fairygui-cc";
import type { ViewModelNode } from "../../../contracts/ui/ViewModel";

/**
 * 把单个 fgui 对象包装为 ViewModelNode。进度语义：renderer 契约传归一化 0..1，
 * 此处映射到进度节点 value（0..100）；目标无 value 属性（非 GProgressBar/GSlider）
 * 时容错跳过，对齐未知节点容错。不依赖 GProgressBar 类引用（mock 环境无此类），
 * 经 value 属性探测。点击经 GObject.on 注册监听（追加语义，注册方需避免重复）。
 */
export function wrapFairyGuiObject(child: GObject): ViewModelNode {
    return {
        setText: (value: string) => {
            child.text = value;
        },
        setProgress: (value: number) => {
            const progress = child as GObject & { value?: number };
            if (progress.value !== undefined) {
                progress.value = Math.min(1, Math.max(0, value)) * 100;
            }
        },
        setVisible: (value: boolean) => {
            child.visible = value;
        },
        setXY: (x: number, y: number) => {
            child.setPosition(x, y);
        },
        setAlpha: (value: number) => {
            child.alpha = value;
        },
        onClick: (handler: () => void) => {
            child.on(Event.CLICK, () => {
                handler();
            }, child);
        },
    };
}

/**
 * 视图节点接缝：包装 fgui 页面根组件按名查找子元素并暴露 ViewModelNode。
 * fgui 类型只存在于本 Adapter 边界；渲染器与游戏层只消费 ViewModelNode 契约。
 * 节点名不存在时返回 undefined（渲染器按契约跳过该绑定）。
 */
export function createFairyGuiViewHandle(
    view: GComponent,
): (name: string) => ViewModelNode | undefined {
    return (name: string): ViewModelNode | undefined => {
        const child = view.getChild(name);
        if (child === null) {
            return undefined;
        }
        return wrapFairyGuiObject(child);
    };
}
