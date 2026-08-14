
import { EnumDuplicateOpenPolicy } from "../../contracts/enums/EnumDuplicateOpenPolicy";

import { EnumUiLayer } from "../../contracts/enums/EnumUiLayer";
import type { IUiPage } from "../../contracts/interfaces/IUiPage";
import type { IUiResult } from "../../contracts/interfaces/IUiResult";
import { UI_LAYER_ORDER } from "../../contracts/constants/UiLayer";
import type { DisposeHandle } from "../scheduling/DisposeHandle";

export interface UiNavigatorOptions {
    /** 同 route 重复打开策略，导航建立时全局锁定。 */
    readonly duplicatePolicy?: EnumDuplicateOpenPolicy;
    /** 页面作用域释放失败的上报回调；缺省使用 console.error。 */
    readonly onError?: (error: unknown) => void;
}

export interface UiNavigator {
    /** 页面栈，从底层到栈顶。 */
    readonly pages: readonly IUiPage[];
    /** 当前栈顶页面；空栈时为 undefined。 */
    readonly top: IUiPage | undefined;
    /** 是否处于阻断模态：栈顶页面声明阻断时成立。 */
    readonly modal: boolean;
    /**
     * 打开页面并入栈。`layer` 缺省为 `normal`；重复打开按建立时锁定的策略处理。
     * 失败（disposed / reject 策略）返回原因且不改变导航状态。
     */
    open(route: string, options?: { layer?: EnumUiLayer; blocking?: boolean }): IUiResult;
    /**
     * 关闭指定页面（缺省为栈顶）。空栈关闭被拒绝；关闭释放页面作用域并移除
     * 该页面，前一层页面成为新的栈顶。重复关闭幂等。
     * 关闭非栈顶页面时原地移除该页：其余页面相对顺序不变（层级关系由打开时
     * 按 layer 插入维护），模态状态始终由关闭后的新栈顶推导。
     */
    close(pageId?: string): IUiResult;
    /** 返回上一页：弹出栈顶页面。空栈返回被拒绝。 */
    back(): IUiResult;
    /** 释放全部页面作用域并使导航不再接受新请求，幂等。 */
    dispose(): void;
}

/**
 * 引擎无关的 UI 导航器。以单一页面栈 + 层级字段表达七层层级契约与返回顺序，
 * 模态状态由栈顶阻断页面统一推导，页面作用域在关闭时逆序释放。不依赖 cc/fgui。
 */
export function createUiNavigator(options: UiNavigatorOptions = {}): UiNavigator {
    const duplicatePolicy: EnumDuplicateOpenPolicy = options.duplicatePolicy ?? EnumDuplicateOpenPolicy.Reject;
    const reportError = options.onError ?? ((error: unknown) => console.error(error));
    const stack: IUiPage[] = [];
    let nextId = 1;
    let disposed = false;

    // 逆序释放页面登记的释放项；单次失败被隔离并上报，不中断其余项释放。
    function releasePageDisposables(disposables: DisposeHandle[]): void {
        for (let index = disposables.length - 1; index >= 0; index -= 1) {
            try {
                disposables[index]?.dispose();
            } catch (error) {
                reportError(error);
            }
        }
        disposables.length = 0;
    }

    function createPage(
        route: string,
        layer: EnumUiLayer,
        blocking: boolean,
    ): IUiPage {
        const id = `ui-page-${nextId}`;
        nextId += 1;
        const disposables: DisposeHandle[] = [];
        let pageDisposed = false;

        return {
            id,
            route,
            layer,
            blocking,
            get disposed(): boolean {
                return pageDisposed;
            },
            addDisposable(disposable: DisposeHandle): void {
                if (pageDisposed) {
                    return;
                }
                disposables.push(disposable);
            },
            dispose(): void {
                if (pageDisposed) {
                    return;
                }
                pageDisposed = true;
                releasePageDisposables(disposables);
            },
        };
    }

    function pageIndex(pageId: string): number {
        return stack.findIndex((page) => page.id === pageId);
    }

    function removeFromStack(page: IUiPage): void {
        const index = pageIndex(page.id);
        if (index >= 0) {
            stack.splice(index, 1);
        }
    }

    // 按层级插入：层高的页面在栈的更上层，同层后打开的在上；保证七层层级
    // 覆盖关系与打开顺序无关（场景层最低、system 层最高）。
    function insertByLayer(page: IUiPage): void {
        const layerHeight = UI_LAYER_ORDER.indexOf(page.layer);
        const insertAt = stack.findIndex(
            (existing) => UI_LAYER_ORDER.indexOf(existing.layer) > layerHeight,
        );
        if (insertAt === -1) {
            stack.push(page);
        } else {
            stack.splice(insertAt, 0, page);
        }
    }

    return {
        get pages(): readonly IUiPage[] {
            return stack;
        },
        get top(): IUiPage | undefined {
            return stack[stack.length - 1];
        },
        get modal(): boolean {
            return stack[stack.length - 1]?.blocking === true;
        },
        open(
            route: string,
            options?: { layer?: EnumUiLayer; blocking?: boolean },
        ): IUiResult {
            if (disposed) {
                return { ok: false, reason: "disposed" };
            }

            const layer = options?.layer ?? EnumUiLayer.Normal;
            const existing = stack.find((page) => page.route === route);

            if (existing !== undefined) {
                if (duplicatePolicy === "reject") {
                    return { ok: false, reason: "route already open" };
                }
                if (duplicatePolicy === "focus-existing") {
                    removeFromStack(existing);
                    insertByLayer(existing);
                    return { ok: true, page: existing };
                }
            }

            const page = createPage(route, layer, options?.blocking ?? false);
            insertByLayer(page);
            return { ok: true, page };
        },
        close(pageId?: string): IUiResult {
            if (disposed) {
                return { ok: false, reason: "disposed" };
            }

            const target =
                pageId === undefined
                    ? stack[stack.length - 1]
                    : stack[stack.length - 1]?.id === pageId
                        ? stack[stack.length - 1]
                        : stack.find((page) => page.id === pageId);

            if (target === undefined) {
                return { ok: false, reason: "page not found" };
            }

            removeFromStack(target);
            target.dispose();
            return { ok: true, page: target };
        },
        back(): IUiResult {
            if (disposed) {
                return { ok: false, reason: "disposed" };
            }
            const target = stack[stack.length - 1];
            if (target === undefined) {
                return { ok: false, reason: "empty stack" };
            }
            removeFromStack(target);
            target.dispose();
            return { ok: true, page: target };
        },
        dispose(): void {
            if (disposed) {
                return;
            }
            disposed = true;
            for (let index = stack.length - 1; index >= 0; index -= 1) {
                try {
                    stack[index]?.dispose();
                } catch (error) {
                    reportError(error);
                }
            }
            stack.length = 0;
        },
    };
}
