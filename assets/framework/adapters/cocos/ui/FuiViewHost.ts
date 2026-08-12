import { Event, GComponent, GObject, UIPackage } from "fairygui-cc";
import {
    createFuiComponentUrl,
    getFuiComponentRegistry,
    type FuiComponentRegistry,
} from "../../../core/fui/FuiComponentRegistry";
import type { FuiView, FuiViewSeam } from "../../../contracts/ui/FuiView";
import { wrapFairyGuiObjectTyped, type FuiElementKind } from "./FairyGuiViewHandle";
import { createFairyGuiView, type FairyGuiViewLike } from "./FairyGuiPageAdapter";

/** 挂载在 GComponent 上的 FuiView 实例：dispose 时级联释放绑定视图。 */
const BOUND_VIEW_KEY = "__fuiBoundView__";

/** 取 GComponent 上挂载的 FuiView 实例；未绑定返回 undefined。 */
export function getBoundView(view: unknown): FuiView<unknown, unknown> | undefined {
    const bound = view as Record<string, unknown> | null | undefined;
    const attached = bound?.[BOUND_VIEW_KEY];
    return attached as FuiView<unknown, unknown> | undefined;
}

/**
 * 把 GComponent 包装为 FuiViewSeam：按名取子元件（能力 kind 分派），注册点击。
 * fgui 类型只存在于本 Adapter 边界；业务 FuiView 只消费能力接口。
 */
function createSeam(component: GComponent): FuiViewSeam {
    return {
        child(name: string, kind: string): ReturnType<typeof wrapFairyGuiObjectTyped> | undefined {
            const child = component.getChild(name);
            if (child === null) {
                return undefined;
            }
            return wrapFairyGuiObjectTyped(child, kind as FuiElementKind);
        },
        onClick(name: string, handler: () => void): () => void {
            const child = component.getChild(name);
            if (child === null) {
                throw new Error(`FuiView 点击绑定缺失: ${name}（组件无此元件）`);
            }
            child.on(Event.CLICK, handler, child);
            return () => {
                child.off(Event.CLICK, handler, child);
            };
        },
    };
}

/**
 * 创建绑定视图：查注册表，命中则创建 GComponent、实例化 FuiView 并 __attach 注入字段
 * 与点击，返回挂载视图；未命中返回 null（调用方回退既有 createFairyGuiView 路径）。
 * 返回的视图是 GComponent 本身（可被 GRoot.addChild 挂载），其 dispose 级联释放 FuiView
 * 绑定（退订 Store/移除监听），再走引擎 dispose。fgui 类型只存在于本 Adapter 边界。
 * createObject 为创建接缝（缺省 UIPackage.createObject），测试可注入记录型 mock。
 */
export function createBoundView(
    packageName: string,
    resName: string,
    registry: FuiComponentRegistry,
    createObject: (pkg: string, res: string) => GObject | null = (pkg, res) =>
        UIPackage.createObject(pkg, res),
): (GComponent & { readonly name: string; dispose(): void }) | null {
    // 单一 URL 构造点：后续注册表查询、错误与 binder 均复用该值，不散落类型断言
    const url = createFuiComponentUrl(packageName, resName);
    const entry = registry.lookup(url);
    if (entry === undefined) {
        return null;
    }

    const component = createObject(packageName, resName);
    if (component === null) {
        throw new Error(`FairyGUI view "${resName}" in package "${packageName}" was not found`);
    }

    // 包装器模式：业务类 extends 引擎无关 FuiView，不 extends GComponent；
    // 这里创建 FuiView 实例并绑定到引擎组件（字段注入/点击注册发生在 __attach）
    const view: FuiView<unknown, unknown> = new entry.ctor();
    view.__attach(createSeam(component as GComponent), entry.fields, entry.clicks);

    const bound = component as GComponent & {
        readonly name: string;
        dispose(): void;
    };
    (bound as unknown as Record<string, unknown>)[BOUND_VIEW_KEY] = view;

    let disposed = false;
    const originalDispose = bound.dispose.bind(bound);
    bound.dispose = (): void => {
        if (disposed) {
            return;
        }
        disposed = true;
        const boundView = (bound as unknown as Record<string, unknown>)[BOUND_VIEW_KEY];
        if (typeof boundView === "object" && boundView !== null) {
            (boundView as { dispose(): void }).dispose();
            (bound as unknown as Record<string, unknown>)[BOUND_VIEW_KEY] = undefined;
        }
        originalDispose();
    };

    return bound;
}

/**
 * 创建路径组合闭包：先查注册表，命中创建绑定视图；未命中回退既有
 * createFairyGuiView 路径（存量页/动态页行为不变）。注册表经注入传入，
 * 缺省用全局单例（装饰器在模块加载期登记，早于组合根 DI，见 core/fui）。
 */
export function createFairyGuiBoundView(
    registry?: FuiComponentRegistry,
): (packageName: string, resName: string) => FairyGuiViewLike {
    return (packageName: string, resName: string): FairyGuiViewLike => {
        const hit = createBoundView(packageName, resName, registry ?? getFuiComponentRegistry());
        if (hit !== null) {
            return hit as unknown as FairyGuiViewLike;
        }
        return createFairyGuiView(packageName, resName);
    };
}
