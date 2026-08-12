import { Event, GComponent, GObject, UIPackage } from "fairygui-cc";
import {
    createFuiComponentUrl,
    getFuiComponentRegistry,
    type FuiComponentRegistry,
    type FuiComponentUrl,
} from "../../../core/fui/FuiComponentRegistry";
import {
    FuiBindingError,
    FuiViewBindingRegistrationError,
    FuiViewCleanupError,
    FuiViewCreationError,
} from "../../../core/fui/FuiErrors";
import {
    type FuiViewBindingResolver,
    type FuiViewBindingScope,
} from "../../../core/fui/FuiViewBinderRegistry";
import type { FuiView, FuiViewSeam } from "../../../contracts/ui/FuiView";
import { wrapFairyGuiObjectTyped, type FuiElementKind } from "./FairyGuiViewHandle";
import { createFairyGuiView, type FairyGuiViewLike } from "./FairyGuiPageAdapter";

/** 挂载在 GComponent 上的 FuiView 实例：dispose 时级联释放绑定视图。 */
const BOUND_VIEW_KEY = "__fuiBoundView__";

/**
 * 对象创建接缝：按包 + 资源名创建引擎对象。返回 `unknown | null` 而非 fgui 类型，
 * 使 boot 组合根（assembleApp 的测试覆盖）可经深层导入本内部符号而不依赖 fgui 类型；
 * fgui 类型只在本 Adapter 边界，createBoundView 在消费处做一次受控收窄。
 */
export type FuiObjectFactory = (
    packageName: string,
    resName: string,
) => unknown | null;

/**
 * 把 GComponent 包装为 FuiViewSeam：按名取子元件（能力 kind 分派），注册点击。
 * 缺失检测下沉到本 seam：字段/点击节点不存在时抛 FuiBindingError（fail-fast），
 * 使 FuiView.__attach 消费非可选返回值。fgui 类型只存在于本 Adapter 边界。
 */
function createSeam(url: FuiComponentUrl, component: GComponent): FuiViewSeam {
    return {
        child(name: string, kind: string): ReturnType<typeof wrapFairyGuiObjectTyped> {
            const child = component.getChild(name);
            if (child === null) {
                throw new FuiBindingError(url, name, "field");
            }
            return wrapFairyGuiObjectTyped(child, kind as FuiElementKind);
        },
        onClick(name: string, handler: () => void): () => void {
            const child = component.getChild(name);
            if (child === null) {
                throw new FuiBindingError(url, name, "click");
            }
            child.on(Event.CLICK, handler, child);
            return () => {
                child.off(Event.CLICK, handler, child);
            };
        },
    };
}

/**
 * 创建失败回滚：primary 错误始终保留在 FuiViewCreationError.cause（不覆盖）；
 * View 与 GComponent 各自 try/catch 清理，失败聚合为 cleanupErrors 传参构造
 * FuiViewCreationError（冻结数组；无原生 AggregateError，ES2015 兼容，见 core/fui/FuiErrors）。
 * flushScopeHandles 为绑定失败时已登记句柄的隔离逆序 flush（Host 是绑定回滚唯一所有者）：
 * 逐句柄 try/catch 释放并收集失败，句柄抛错不中断后续句柄；随后再清理 View 与 GComponent。
 * 与成功路径共用同一 flush，保证各底层非幂等句柄在两条路径上至多执行一次。
 */
function throwWithRollback(
    url: FuiComponentUrl,
    primary: unknown,
    view: FuiView<unknown, unknown> | undefined,
    component: GObject | null,
    flushScopeHandles: (errors: unknown[]) => void = () => {},
): never {
    const cleanupErrors: unknown[] = [];
    flushScopeHandles(cleanupErrors);
    if (view !== undefined) {
        try {
            view.dispose();
        } catch (error) {
            cleanupErrors.push(error);
        }
    }
    if (component !== null) {
        try {
            component.dispose();
        } catch (error) {
            cleanupErrors.push(error);
        }
    }
    throw new FuiViewCreationError(url, primary, cleanupErrors);
}

/**
 * 创建绑定视图：查注册表，命中则创建 GComponent、实例化 FuiView 并 __attach 注入字段
 * 与点击，返回挂载视图；未命中返回 null（调用方回退既有 createFairyGuiView 路径）。
 * 返回的视图是 GComponent 本身（可被 GRoot.addChild 挂载），其 dispose 级联释放 FuiView
 * 绑定（退订 Store/移除监听），再走引擎 dispose——两者独立 try/catch，任一失败不阻断
 * 另一方，全部失败聚合为 FuiViewCleanupError（幂等）。fgui 类型只存在于本 Adapter 边界。
 * createObject 为创建接缝（缺省 UIPackage.createObject），测试可注入记录型 mock。
 * bindingResolver 为内部运行时 binder 解析器（缺省 undefined）：`runtimeBinding: "required"`
 * 组件在 __attach 后必须经其执行 binder，缺失时 fail-fast（typed missing-binder）并回滚。
 */
export function createBoundView(
    packageName: string,
    resName: string,
    registry: FuiComponentRegistry,
    bindingResolver: FuiViewBindingResolver | undefined,
    createObject: FuiObjectFactory = (pkg, res) =>
        UIPackage.createObject(pkg, res),
): (GComponent & { readonly name: string; dispose(): void }) | null {
    // 单一 URL 构造点：后续注册表查询、错误与 binder 均复用该值，不散落类型断言
    const url = createFuiComponentUrl(packageName, resName);
    const entry = registry.lookup(url);
    if (entry === undefined) {
        return null;
    }

    // createObject 返回 unknown：在 Adapter 边界做一次受控收窄（fgui 类型只存在于此）
    const component = createObject(packageName, resName) as GObject | null;
    if (component === null) {
        // createObject 失败：无组件可回滚，直接包装为创建失败
        throw new FuiViewCreationError(
            url,
            new Error(`FairyGUI view "${resName}" in package "${packageName}" was not found`),
        );
    }

    // 包装器模式：业务类 extends 引擎无关 FuiView，不 extends GComponent；
    // 这里创建 FuiView 实例并绑定到引擎组件（字段注入/点击注册发生在 __attach）
    let view: FuiView<unknown, unknown>;
    try {
        view = new entry.ctor();
    } catch (cause) {
        // ctor 抛错：已创建的 GComponent 仍须回滚（清理失败不影响 primary cause）
        throwWithRollback(url, cause, undefined, component);
    }
    try {
        view.__attach(createSeam(url, component as GComponent), entry.fields, entry.clicks);
    } catch (cause) {
        // binder/attach 失败：View 与 GComponent 均回滚，primary 保持在 cause
        throwWithRollback(url, cause, view, component);
    }

    // runtimeBinding 装配：binder 前创建句柄栈，binder 每获得句柄立即登记；
    // 隔离逆序 flush 同时供成功转交（view.__own 单一句柄）与失败回滚使用：
    // 逐句柄 try/catch，全部句柄被尝试，错误聚合到 errors；结束时清空句柄栈。
    // 两条路径共用同一 flush，保证各底层非幂等句柄至多执行一次（无双重跟踪）。
    if (entry.runtimeBinding === "required") {
        const scopeHandles: Array<{ dispose(): void }> = [];
        const flushScopeHandles = (errors: unknown[]): void => {
            for (let i = scopeHandles.length - 1; i >= 0; i--) {
                try {
                    scopeHandles[i]!.dispose();
                } catch (error) {
                    errors.push(error);
                }
            }
            scopeHandles.length = 0;
        };
        const scope: FuiViewBindingScope = {
            own(handle) {
                scopeHandles.push(handle);
            },
        };
        try {
            if (bindingResolver === undefined) {
                throw new FuiViewBindingRegistrationError(url);
            }
            bindingResolver.bindRequired(url, view, scope);
        } catch (cause) {
            throwWithRollback(url, cause, view, component, flushScopeHandles);
        }
        // 成功：把隔离逆序 flush 作为单一句柄转交视图；视图 dispose 时执行同一 flush，
        // 全部句柄逆序隔离释放，任一失败聚合为 FuiViewCleanupError（无需 Host 额外聚合）
        view.__own({
            dispose: () => {
                const errors: unknown[] = [];
                flushScopeHandles(errors);
                if (errors.length > 0) {
                    throw new FuiViewCleanupError(url, errors);
                }
            },
        });
    }

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
        const errors: unknown[] = [];
        const boundView = (bound as unknown as Record<string, unknown>)[BOUND_VIEW_KEY];
        if (typeof boundView === "object" && boundView !== null) {
            try {
                (boundView as { dispose(): void }).dispose();
            } catch (error) {
                errors.push(error);
            }
            (bound as unknown as Record<string, unknown>)[BOUND_VIEW_KEY] = undefined;
        }
        try {
            originalDispose();
        } catch (error) {
            errors.push(error);
        }
        if (errors.length > 0) {
            throw new FuiViewCleanupError(url, errors);
        }
    };

    return bound;
}

/**
 * 创建路径组合闭包：先查注册表，命中创建绑定视图；未命中回退既有
 * createFairyGuiView 路径（存量页/动态页行为不变）。注册表经 options 注入，
 * 缺省用全局单例（装饰器在模块加载期登记，早于组合根 DI，见 core/fui）；
 * bindingResolver 缺省 undefined，required 组件缺少 resolver 时创建 fail-fast。
 * createObject 经 options 注入（缺省 UIPackage.createObject），供测试覆盖对象创建。
 */
export function createFairyGuiBoundView(
    bindingResolver: FuiViewBindingResolver | undefined,
    options?: {
        componentRegistry?: FuiComponentRegistry;
        createObject?: FuiObjectFactory;
    },
): (packageName: string, resName: string) => FairyGuiViewLike {
    const registry = options?.componentRegistry ?? getFuiComponentRegistry();
    const createObject =
        options?.createObject ?? ((pkg: string, res: string) => UIPackage.createObject(pkg, res));
    return (packageName: string, resName: string): FairyGuiViewLike => {
        const hit = createBoundView(packageName, resName, registry, bindingResolver, createObject);
        if (hit !== null) {
            return hit as unknown as FairyGuiViewLike;
        }
        return createFairyGuiView(packageName, resName);
    };
}
