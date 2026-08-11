import { Event, GComponent, GObject, UIPackage } from "fairygui-cc";
import type { ViewModelNode } from "../../../contracts/ui/ViewModel";
import { wrapFairyGuiObject } from "./FairyGuiViewHandle";
import type { GRootLike } from "./CocosUiRoot";

/** 交互事件桥：组合根把 fgui 触摸/悬停事件翻译为控制器的坐标回调。 */
export interface DevOverlayInteractionHandlers {
    onTouchBegin(x: number, y: number): void;
    onTouchMove(x: number, y: number): void;
    onTouchEnd(): void;
    onHoverIn(): void;
    onHoverOut(): void;
}

export interface DevOverlayViewOptions {
    /** 已加载包名（UIPackage 注册名）；缺省 "DevOverlay"。 */
    readonly packageName?: string;
    /** 根容器（GRoot）：把球组件挂到最上层。 */
    readonly root: GRootLike;
    /** 组件创建接缝；缺省 UIPackage.createObject，测试可注入 mock。 */
    readonly createObject?: (packageName: string, resName: string) => GObject | null;
}

/**
 * DevOverlay 视图句柄：在 Adapter 边界内创建 DevOverlayBall 组件并挂到 GRoot，
 * 提供递归节点解析（球/面板/面板内文本子节点）与交互事件桥。fgui 类型只存在
 * 于本文件；dev 层消费本句柄而不直接 import fgui。
 */
export interface DevOverlayView {
    /** 球组件尺寸（GRoot 坐标系），供贴边露头计算。 */
    readonly ballSize: { readonly width: number; readonly height: number };
    /**
     * 节点解析器：优先返回球组件自身包装（名 "ball"）与面板组件包装
     * （名 "panel"），其余名字按"递归子节点查找"解析（面板内文本子节点）。
     */
    readonly node: (name: string) => ViewModelNode | undefined;
    /** 绑定交互：把 fgui TOUCH/ROLL_OVER 事件桥接到控制器回调。 */
    bindInteraction(handlers: DevOverlayInteractionHandlers): void;
    /** 从 GRoot 移除并释放组件。幂等。 */
    dispose(): void;
}

/** 触点事件坐标读取：fgui Event 携带 GRoot 全局坐标（Vec2.pos）。 */
function locationOf(event: unknown): { readonly x: number; readonly y: number } {
    const pos = (event as { pos?: { x: number; y: number } }).pos;
    if (pos === undefined) {
        return { x: 0, y: 0 };
    }
    return { x: pos.x, y: pos.y };
}

/** 递归收集组件子树中按名唯一命中的 GObject（嵌套组件内的文本子节点可寻址）。 */
function collectByName(root: GComponent): Map<string, GObject> {
    const byName = new Map<string, GObject>();
    const visit = (component: GComponent): void => {
        for (let index = 0; index < component.numChildren; index += 1) {
            const child = component.getChildAt(index) as GObject;
            if (child.name.length > 0 && !byName.has(child.name)) {
                byName.set(child.name, child);
            }
            if (child instanceof GComponent) {
                visit(child);
            }
        }
    };
    visit(root);
    return byName;
}

export function createDevOverlayView(
    options: DevOverlayViewOptions,
): DevOverlayView {
    const packageName = options.packageName ?? "DevOverlay";
    const createObject =
        options.createObject ??
        ((pkg: string, res: string) => UIPackage.createObject(pkg, res));
    const component = createObject(packageName, "DevOverlayBall");

    // 组件创建失败：保留空句柄（无节点、无交互），避免组合根抛错中断启动
    let ballComponent: GComponent | undefined;
    if (component instanceof GComponent) {
        ballComponent = component;
        options.root.addChild(component);
    }

    const panel = ballComponent?.getChild("panel") as GObject | undefined;
    const children = ballComponent === undefined ? new Map<string, GObject>() : collectByName(ballComponent);

    const node = (name: string): ViewModelNode | undefined => {
        if (name === "ball") {
            return ballComponent === undefined ? undefined : wrapFairyGuiObject(ballComponent);
        }
        if (name === "panel") {
            return panel === undefined ? undefined : wrapFairyGuiObject(panel);
        }
        const child = children.get(name);
        return child === undefined ? undefined : wrapFairyGuiObject(child);
    };

    const bindInteraction = (handlers: DevOverlayInteractionHandlers): void => {
        if (ballComponent === undefined) {
            return;
        }
        ballComponent.on(Event.TOUCH_BEGIN, (evt: Event) => {
            // 捕获触摸：fgui 的 TOUCH_MOVE/TOUCH_END 默认仅在触点位于对象内时
            // 派发，触点移出球的可点区域后不再触发（球收缩时很小，极易移出），
            // 导致无法拖动。captureTouch 把球加入触摸监视，保证整个拖动过程
            // move/end 持续派发给球组件。
            evt.captureTouch();
            const p = locationOf(evt);
            handlers.onTouchBegin(p.x, p.y);
        }, ballComponent);
        ballComponent.on(Event.TOUCH_MOVE, (evt: unknown) => {
            const p = locationOf(evt);
            handlers.onTouchMove(p.x, p.y);
        }, ballComponent);
        ballComponent.on(Event.TOUCH_END, () => {
            handlers.onTouchEnd();
        }, ballComponent);
        ballComponent.on(Event.ROLL_OVER, () => {
            handlers.onHoverIn();
        }, ballComponent);
        ballComponent.on(Event.ROLL_OUT, () => {
            handlers.onHoverOut();
        }, ballComponent);
    };

    const dispose = (): void => {
        if (ballComponent === undefined) {
            return;
        }
        options.root.removeChild(ballComponent, true);
        ballComponent = undefined;
    };

    return {
        ballSize: {
            width: ballComponent?.width ?? 48,
            height: ballComponent?.height ?? 48,
        },
        node,
        bindInteraction,
        dispose,
    };
}
