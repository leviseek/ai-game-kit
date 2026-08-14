import type { DisposeHandle } from "../../core/scheduling/DisposeHandle";
import type { EnumUiLayer } from "../enums/EnumUiLayer";

/**
 * 打开的页面实例。每个页面持有独立作用域，登记的资源/订阅在页面关闭时
 * 按逆序释放；重复释放幂等。
 */
export interface IUiPage {
    readonly id: string;
    readonly route: string;
    readonly layer: EnumUiLayer;
    /** 是否声明阻断输入：成为栈顶时导航进入模态状态。 */
    readonly blocking: boolean;
    readonly disposed: boolean;
    /** 登记释放项；页面关闭时按登记逆序释放，已释放页面登记为 no-op。 */
    addDisposable(disposable: DisposeHandle): void;
    /** 释放页面作用域，幂等。 */
    dispose(): void;
}
