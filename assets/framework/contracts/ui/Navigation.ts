/**
 * 引擎无关的 UI 导航契约：route、页面栈、层级、模态与页面作用域。
 * 不依赖 cc 或 fgui；FairyGUI 容器名映射属于 Adapter 层，不在此定义。
 */
import type { DisposeHandle } from "../../core/scheduling/DisposeHandle";

/** 七层层级契约，从低到高：scene < normal < popup < guide < toast < loading < system。 */
export type UiLayer =
    | "scene"
    | "normal"
    | "popup"
    | "guide"
    | "toast"
    | "loading"
    | "system";

export const UI_LAYER_ORDER: readonly UiLayer[] = [
    "scene",
    "normal",
    "popup",
    "guide",
    "toast",
    "loading",
    "system",
];

/**
 * 重复打开策略：在导航建立时全局锁定。
 * - `focus-existing`：已存在同 route 页面时提升到其层级内的最高位置，不新增实例；
 *   仍受七层层级覆盖关系约束，不会压过更高层页面。
 * - `reject`：已存在同 route 页面时拒绝本次打开并返回原因。
 * - `allow-stack`：允许同 route 页面多实例堆叠。
 */
export type DuplicateOpenPolicy = "focus-existing" | "reject" | "allow-stack";

/**
 * 打开的页面实例。每个页面持有独立作用域，登记的资源/订阅在页面关闭时
 * 按逆序释放；重复释放幂等。
 */
export interface UiPage {
    readonly id: string;
    readonly route: string;
    readonly layer: UiLayer;
    /** 是否声明阻断输入：成为栈顶时导航进入模态状态。 */
    readonly blocking: boolean;
    readonly disposed: boolean;
    /** 登记释放项；页面关闭时按登记逆序释放，已释放页面登记为 no-op。 */
    addDisposable(disposable: DisposeHandle): void;
    /** 释放页面作用域，幂等。 */
    dispose(): void;
}

/** 打开/关闭结果：ok=false 时携带原因，失败不改变导航状态。 */
export interface UiResult {
    readonly ok: boolean;
    readonly page?: UiPage;
    readonly reason?: string;
}
