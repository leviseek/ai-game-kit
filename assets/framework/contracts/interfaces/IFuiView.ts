/**
 * FuiView 绑定视图契约（引擎无关，包装器模式）：业务静态页继承
 * core/fui/FuiView 实现类，字段以 `_` + 元件名自动注入（类型来自 gen-types
 * 生成的 declaration merging interface），点击经 @FClick 注册。
 * 本接口只声明框架内部使用的公共接缝（__own/__attach/dispose），生命周期钩子
 * （bindStore/onConstruct/onState/onOpen/onClose）为实现的 protected 成员，
 * 由子类经继承访问，不进入契约。
 */

import type { IFuiViewSeam } from "./IFuiViewSeam";
import type { IFuiClickMeta } from "./IFuiClickMeta";

/**
 * 绑定视图公共契约（框架内部使用面）。生命周期由实现类 core/fui/FuiView 承担：
 * - `__attach(seam, fields, clicks)`：框架（FuiViewHost）在组件创建后调用，注入
 *   `_` 字段、注册 @FClick、随后调 `onConstruct()`。业务构造器内不得访问 `_` 字段。
 * - `__own(handle)`：登记外部持有句柄，dispose 时按注册逆序执行 owner 清理。
 * - `dispose()`：先标记已销毁，再逆序执行全部 owner + `onClose()`；单步失败聚合为
 *   `FuiViewCleanupError`（不中断后续步骤），重复调用为 no-op。
 */
// S/VM 泛型保留实现类形状供外部类型引用一致（bindStore/onState 为 protected，
// 不在公共契约内，故此处未使用；子类经继承实现类访问）。
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface IFuiView<S, VM> {
    /** 注册外部持有句柄：dispose 时按注册逆序执行 owner 清理（幂等安全）。 */
    __own(handle: { dispose(): void }): void;
    /** 框架内部：绑定接缝、注入字段、注册点击。仅由 FuiViewHost 调用一次。 */
    __attach(seam: IFuiViewSeam, fields: Readonly<Record<string, string>>, clicks: readonly IFuiClickMeta[]): void;
    /** 释放：先标记已销毁，逆序执行全部 owner，最后 onClose；失败聚合为 FuiViewCleanupError。 */
    dispose(): void;
}
