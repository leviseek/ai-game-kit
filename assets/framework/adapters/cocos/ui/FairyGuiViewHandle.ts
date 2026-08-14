import { Event, GComponent, GObject } from "fairygui-cc";
import type { IViewModelNode } from "../../../contracts/interfaces/IViewModelNode";
import type { ITypedButtonNode } from "../../../contracts/interfaces/ITypedButtonNode";
import type { ITypedComponentNode } from "../../../contracts/interfaces/ITypedComponentNode";
import type { ITypedImageNode } from "../../../contracts/interfaces/ITypedImageNode";
import type { ITypedInputNode } from "../../../contracts/interfaces/ITypedInputNode";
import type { ITypedListNode } from "../../../contracts/interfaces/ITypedListNode";
import type { ITypedNode } from "../../../contracts/interfaces/ITypedNode";
import type { ITypedProgressNode } from "../../../contracts/interfaces/ITypedProgressNode";
import type { ITypedTextNode } from "../../../contracts/interfaces/ITypedTextNode";

/** 引擎无关的能力 kind（与 gen-types 的 ElementKind 对应，业务层不持 fgui 类型）。 */
export type FuiElementKind =
    | "button" | "input" | "progress" | "text" | "richText"
    | "list" | "component" | "image" | "movieclip";

/** 文本可写能力探测：GTextField/GTextInput 等具备 text 属性。 */
function hasText(obj: GObject): obj is GObject & { text: string } {
    return "text" in obj;
}

/** 进度可写能力探测：GProgressBar/GSlider 具备 value 属性。 */
function hasValue(obj: GObject): obj is GObject & { value: number } {
    return "value" in obj;
}

/** 点击能力探测：GObject 均具备 on；仅按钮/组件注册点击。 */
function isClickable(obj: GObject): obj is GObject & { on: GObject["on"] } {
    return typeof (obj as { on?: unknown }).on === "function";
}

/**
 * 把单个 fgui 对象按能力 kind 包装为引擎无关的能力接口。
 * kind 来自 gen-types（XML 静态事实），各操作经运行时能力探测实现
 * （text/value/on），不依赖 GTextField 等类引用（mock 环境无此类）。
 * 能力缺失时对应操作安全降级（如进度写值跳过），对齐 wrapFairyGuiObject 容错风格。
 */
export function wrapFairyGuiObjectTyped(child: GObject, kind: FuiElementKind): ITypedNode {
    switch (kind) {
        case "button": {
            const base = toTextNode(child);
            const node: ITypedButtonNode = {
                ...base,
                onClick(handler: () => void): void {
                    if (isClickable(child)) {
                        child.on(Event.CLICK, () => handler(), child);
                    }
                },
            };
            return node;
        }
        case "input": {
            const base = toTextNode(child);
            const node: ITypedInputNode = {
                ...base,
                readText(): string {
                    return hasText(child) ? child.text : "";
                },
            };
            return node;
        }
        case "text":
        case "richText":
            return toTextNode(child);
        case "progress": {
            const node: ITypedProgressNode = {
                setVisible(visible: boolean): void {
                    child.visible = visible;
                },
                setProgress(value: number): void {
                    if (hasValue(child)) {
                        child.value = Math.min(1, Math.max(0, value)) * 100;
                    }
                },
            };
            return node;
        }
        case "image": {
            const node: ITypedImageNode = {
                setVisible(visible: boolean): void {
                    child.visible = visible;
                },
            };
            return node;
        }
        case "list": {
            const node: ITypedListNode = {
                setVisible(visible: boolean): void {
                    child.visible = visible;
                },
            };
            return node;
        }
        case "movieclip":
        case "component":
        default: {
            const node: ITypedComponentNode = {
                setVisible(visible: boolean): void {
                    child.visible = visible;
                },
                onClick(handler: () => void): void {
                    if (isClickable(child)) {
                        child.on(Event.CLICK, () => handler(), child);
                    }
                },
            };
            return node;
        }
    }
}

/** 文本能力包装（text/richText 共用）：写 text 时经 setText 语义，读经 text()。 */
function toTextNode(child: GObject): ITypedTextNode {
    return {
        setText(value: string): void {
            if (hasText(child)) {
                child.text = value;
            }
        },
        text(): string {
            return hasText(child) ? child.text : "";
        },
        setVisible(visible: boolean): void {
            child.visible = visible;
        },
    };
}

/**
 * 把单个 fgui 对象包装为 IViewModelNode。进度语义：renderer 契约传归一化 0..1，
 * 此处映射到进度节点 value（0..100）；目标无 value 属性（非 GProgressBar/GSlider）
 * 时容错跳过，对齐未知节点容错。不依赖 GProgressBar 类引用（mock 环境无此类），
 * 经 value 属性探测。点击经 GObject.on 注册监听（追加语义，注册方需避免重复）。
 */
export function wrapFairyGuiObject(child: GObject): IViewModelNode {
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
 * 视图节点接缝：包装 fgui 页面根组件按名查找子元素并暴露 IViewModelNode。
 * fgui 类型只存在于本 Adapter 边界；渲染器与游戏层只消费 IViewModelNode 契约。
 * 节点名不存在时返回 undefined（渲染器按契约跳过该绑定）。
 */
export function createFairyGuiViewHandle(
    view: GComponent,
): (name: string) => IViewModelNode | undefined {
    return (name: string): IViewModelNode | undefined => {
        const child = view.getChild(name);
        if (child === null) {
            return undefined;
        }
        return wrapFairyGuiObject(child);
    };
}
