/**
 * FuiView 绑定视图基类（引擎无关，包装器模式）：业务静态页继承本类，
 * 字段以 `_` + 元件名自动注入（类型来自 gen-types 生成的 declaration merging interface），
 * 点击经 @FClick 注册。本类不 extends GComponent——FGUI 类型只存在于 Adapter 边界，
 * 实际组件由 FuiViewHost 创建后经视图接缝绑定到本实例。
 */

import { FuiViewCleanupError } from "../../core/fui/FuiErrors";
import type { Action, Store } from "../state/Store";
import type { TypedNode } from "./TypedNode";

/**
 * 视图接缝：Adapter 边界包装 FGUI 组件的引擎无关访问面。
 * child() 返回按能力 kind 包装的能力节点（非可选：缺失时由 seam 抛 FuiBindingError）；
 * onClick() 注册点击并返回退订，节点缺失同样抛 FuiBindingError。
 */
export interface FuiViewSeam {
    /** 按名取子元件能力节点；kind 为 gen-types 的能力 kind（text/button/...）。 */
    child(name: string, kind: string): TypedNode;
    /** 注册点击监听；返回退订函数。 */
    onClick(name: string, handler: () => void): () => void;
}

/** @FClick 收集的点击元数据：节点名 + 原型方法引用（实例化时 bind this）。 */
export interface FuiClickMeta {
    readonly nodeName: string;
    readonly methodRef: (this: FuiView<unknown, unknown>, ...args: unknown[]) => unknown;
}

/**
 * 绑定视图基类。生命周期：
 * - `__attach(seam, fields, clicks)`：框架（FuiViewHost）在组件创建后调用，注入
 *   `_` 字段、注册 @FClick、随后调 `onConstruct()`。业务构造器内不得访问 `_` 字段。
 * - `bindStore(store, project)`：订阅 Store，状态变化经 project 投影后写 `onState(vm)`；
 *   首次投影在订阅建立时立即执行。
 * - `dispose()`：先标记已销毁，再逆序执行全部 owner + `onClose()`；单步失败聚合为
 *   `FuiViewCleanupError`（不中断后续步骤），重复调用为 no-op。
 * 绑定缺失（gen-types 声明了字段但组件无该元件）由 seam 抛 `FuiBindingError`（fail-fast）。
 */
export abstract class FuiView<S, VM> {
    private seam: FuiViewSeam | undefined;
    private disposed = false;
    private readonly owners: Array<() => void> = [];

    /**
     * 注册外部持有句柄：dispose 时按注册逆序执行 owner 清理。视图已 dispose 后注册的
     * handle 立即执行（no-op 安全：不吞错，也不重复进入聚合流程，与 dispose 幂等一致）。
     */
    __own(handle: { dispose(): void }): void {
        if (this.disposed) {
            handle.dispose();
            return;
        }
        this.owners.push(() => handle.dispose());
    }

    /** 框架内部：绑定接缝、注入字段、注册点击。仅由 FuiViewHost 调用一次。 */
    __attach(
        seam: FuiViewSeam,
        fields: Readonly<Record<string, string>>,
        clicks: readonly FuiClickMeta[],
    ): void {
        if (this.seam !== undefined) {
            throw new Error("FuiView already attached");
        }
        this.seam = seam;
        for (const elementName of Object.keys(fields)) {
            const kind = fields[elementName];
            // child 非可选返回：缺失检测在 seam（抛 FuiBindingError），此处直接注入
            (this as unknown as Record<string, unknown>)["_" + elementName] = seam.child(
                elementName,
                kind,
            );
        }
        for (const click of clicks) {
            this.__own({ dispose: seam.onClick(click.nodeName, click.methodRef.bind(this)) });
        }
        this.onConstruct();
    }

    /** 订阅 Store：状态经 project 投影后写 onState；首次立即投影。 */
    protected bindStore(store: Store<S, Action>, project: (state: S) => VM): void {
        this.__own(
            store.subscribe((state) => {
                if (!this.disposed) {
                    this.onState(project(state));
                }
            }),
        );
        this.onState(project(store.getState()));
    }

    /** 元素注入与点击注册完成后调用：此时 `_` 字段可用。 */
    protected abstract onConstruct(): void;
    /** Store 状态投影回调：子类把 ViewModel 写入 `_` 字段。 */
    protected abstract onState(vm: VM): void;
    /** 页面打开（可选）。 */
    protected onOpen(): void { }
    /** 页面关闭（可选）。 */
    protected onClose(): void { }

    /** 释放：先标记已销毁，逆序执行全部 owner，最后 onClose；任一失败聚合为 FuiViewCleanupError。 */
    dispose(): void {
        if (this.disposed) {
            return;
        }
        // 先标记：即使清理抛错，重复 dispose 仍为 no-op（幂等不依赖清理成功）
        this.disposed = true;
        const errors: unknown[] = [];
        for (let i = this.owners.length - 1; i >= 0; i--) {
            try {
                this.owners[i]!();
            } catch (error) {
                errors.push(error);
            }
        }
        this.owners.length = 0;
        try {
            this.onClose();
        } catch (error) {
            errors.push(error);
        }
        if (errors.length > 0) {
            throw new FuiViewCleanupError(this.constructor.name, errors);
        }
    }
}
