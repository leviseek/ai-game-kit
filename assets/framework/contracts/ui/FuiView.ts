/**
 * FuiView 绑定视图基类（引擎无关，包装器模式）：业务静态页继承本类，
 * 字段以 `_` + 元件名自动注入（类型来自 gen-types 生成的 declaration merging interface），
 * 点击经 @FClick 注册。本类不 extends GComponent——FGUI 类型只存在于 Adapter 边界，
 * 实际组件由 FuiViewHost 创建后经视图接缝绑定到本实例。
 */

import type { Action, Store } from "../state/Store";
import type { TypedNode } from "./TypedNode";

/**
 * 视图接缝：Adapter 边界包装 FGUI 组件的引擎无关访问面。
 * child() 返回按能力 kind 包装的能力节点；onClick() 注册点击并返回退订。
 */
export interface FuiViewSeam {
    /** 按名取子元件能力节点；kind 为 gen-types 的能力 kind（text/button/...）。 */
    child(name: string, kind: string): TypedNode | undefined;
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
 * - `dispose()`：退订 Store + 移除全部监听 + `onClose()`，幂等。
 * 绑定缺失（gen-types 声明了字段但组件无该元件）在 `__attach` 阶段抛错（fail-fast）。
 */
export abstract class FuiView<S, VM> {
    private seam: FuiViewSeam | undefined;
    private disposed = false;
    private readonly disposables: Array<() => void> = [];

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
            const node = seam.child(elementName, kind);
            if (node === undefined) {
                throw new Error(
                    `FuiView 绑定缺失: ${elementName}（生成类型声明了该字段但组件无此元件，检查 XML 与 gen-types 产物）`,
                );
            }
            (this as unknown as Record<string, unknown>)["_" + elementName] = node;
        }
        for (const click of clicks) {
            const dispose = seam.onClick(click.nodeName, click.methodRef.bind(this));
            this.disposables.push(dispose);
        }
        this.onConstruct();
    }

    /** 订阅 Store：状态经 project 投影后写 onState；首次立即投影。 */
    protected bindStore(store: Store<S, Action>, project: (state: S) => VM): void {
        this.disposables.push(
            store.subscribe((state) => {
                if (!this.disposed) {
                    this.onState(project(state));
                }
            }).dispose,
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

    /** 释放：退订 Store + 移除全部点击监听 + onClose。幂等。 */
    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        for (const dispose of this.disposables.splice(0)) {
            dispose();
        }
        this.onClose();
    }
}
