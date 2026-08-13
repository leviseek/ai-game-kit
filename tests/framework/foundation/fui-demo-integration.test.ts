import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

import { lookupBundle } from "../../../assets/framework";
import { getFuiComponentRegistry } from "../../../assets/framework/core/fui/FuiComponentRegistry";
import { FuiViewBindingRegistrationError, FuiViewCreationError } from "../../../assets/framework/core/fui/FuiErrors";
import { CLOSE_DIALOG_ACTIONS } from "../../../assets/samples/game_fui_demo/store";
import { UiDemoCloseDialog } from "../../../assets/ui/generated/ui-demo";
import { createCcMock } from "./helpers/cc-mock";
import { createFairyGuiMock } from "./helpers/fairygui-mock";

mock.module("cc", () => createCcMock());
mock.module("cc/env", () => ({ DEBUG: false }));

// AppRoot 经 createCocosUiRoot 工厂间接依赖 fairygui-cc；测试不加载真实运行时，
// 统一使用共享 fixture（bun mock.module 全局共享首个生效，保证全量运行符号齐全）。
mock.module("fairygui-cc", () => createFairyGuiMock());

/** 可注入的引擎组件 mock：具备 getChild/on/off/dispose（对齐真实 GComponent 使用面）。 */
interface DialogComponent {
    readonly name: string;
    readonly disposed: number;
    readonly children: Record<string, { text?: string; visible?: boolean }>;
    readonly clickHandlers: Map<string, () => void>;
    getChild(name: string): unknown;
    on(type: string, handler: () => void, target?: unknown): void;
    off(type: string, handler?: () => void, target?: unknown): void;
    dispose(): void;
}

function makeDialogComponent(children: Record<string, { text?: string; visible?: boolean }>): DialogComponent {
    const clickHandlers = new Map<string, () => void>();
    return {
        name: "CloseDialog",
        disposed: 0,
        children,
        clickHandlers,
        getChild(name: string) {
            const child = children[name];
            if (child === undefined) {
                return null;
            }
            return {
                on(_type: string, handler: () => void) {
                    clickHandlers.set(name, handler);
                },
                off(_type: string) {
                    clickHandlers.delete(name);
                },
                get text() {
                    return children[name]?.text ?? "";
                },
                set text(value: string) {
                    if (children[name]) {
                        children[name]!.text = value;
                    }
                },
                get visible() {
                    return children[name]?.visible ?? true;
                },
                set visible(value: boolean) {
                    if (children[name]) {
                        children[name]!.visible = value;
                    }
                },
            };
        },
        on() {},
        off() {},
        dispose() {
            this.disposed++;
        },
    };
}

/** 页面适配器接缝：createPage 返回句柄、destroy 销毁页面（对齐 FairyGuiPageAdapter 使用面）。 */
interface PageAdapterLike {
    createPage(
        route: string,
        layer: string,
        options?: { packageName?: string; resName?: string },
    ): {
        readonly view: unknown | undefined;
        readonly disposed: boolean;
        readonly error: unknown;
    };
    destroy(page: { readonly view?: unknown }): void;
}

interface AppAssemblyLike {
    readonly uiHost: {
        smokeUiInit(): boolean;
        pageAdapter?: PageAdapterLike;
    };
    readonly fuiViewBindingRegistrar: unknown;
}

/** Feature handle 接缝：暴露 Feature 级 Store 与 dispose（见 createCloseDialogFeature）。 */
interface CloseDialogFeatureLike {
    readonly store: {
        dispatch(action: { readonly type: string; readonly content?: string }): void;
    };
    dispose(): void;
}

describe("CloseDialog 示范静态页生产链集成", () => {
    test("required binder missing → Feature 装配 → dispatch/投影/facade → 重开可再 dispatch → Feature dispose 注销后 fail-fast 回滚", async () => {
        // 复用生产 Registry：保存当前引用，用例结束恢复原引用（禁止无条件 delete，
        // 否则会删掉已由缓存 ESM 模块登记的组件元数据，破坏其它用例）
        const g = globalThis as Record<string, unknown>;
        const original = g["__ai_game_kit_fui_components__"];
        if (original === undefined) {
            delete g["__ai_game_kit_fui_components__"];
        }
        try {
            // import samples entry：CloseDialog 装饰器登记组件元数据，并经
            // registerBundle 注册真实 samples bundle descriptor；从 lookupBundle
            // 取 Feature factory，但暂不安装 Feature（先验证 required binder missing）
            await import(pathToFileURL(resolve(import.meta.dir, "../../../assets/samples/entry.ts")).href);
            const registry = getFuiComponentRegistry();
            expect(registry.lookup(UiDemoCloseDialog)).toBeDefined();

            const descriptor = lookupBundle("samples") as {
                createCloseDialogFeature?: (registrar: unknown, effects: { confirm: () => void; cancel: () => void }) => CloseDialogFeatureLike;
            };
            expect(typeof descriptor?.createCloseDialogFeature).toBe("function");
            const createFeature = descriptor.createCloseDialogFeature!;

            const appRoot = (await import(pathToFileURL(resolve(import.meta.dir, "../../../assets/boot/assembly.ts")).href)) as {
                assembleApp(options?: { fuiObjectFactory?: (packageName: string, resName: string) => unknown | null }): AppAssemblyLike;
            };

            const confirm = mock(() => {});
            const cancel = mock(() => {});
            // 记录每次 createPage 创建的 GComponent：失败路径需断言「点击监听 + GComponent 回滚」
            const createdComponents: DialogComponent[] = [];
            const assembly = appRoot.assembleApp({
                // 对象创建接缝：每次 createPage 返回记录型 GComponent（生产无参走 UIPackage.createObject）
                fuiObjectFactory: () => {
                    const component = makeDialogComponent({
                        img_mask: { visible: true },
                        img_panel: { visible: true },
                        txt_title: { text: "", visible: true },
                        txt_content: { text: "", visible: true },
                        btn_cancel_bg: { visible: true },
                        txt_cancel: { text: "", visible: true },
                        btn_confirm_bg: { visible: true },
                        txt_confirm: { text: "", visible: true },
                    });
                    createdComponents.push(component);
                    return component;
                },
            });
            expect(assembly.uiHost.smokeUiInit()).toBe(true);
            const adapter = assembly.uiHost.pageAdapter;
            expect(adapter).toBeDefined();

            // 首次创建：required binder 缺失 fail-fast（typed missing-binder + 回滚）
            const missingPage = adapter!.createPage("dialog", "normal", {
                packageName: "Demo",
                resName: "CloseDialog",
            });
            expect(missingPage.disposed).toBe(true);
            const error = missingPage.error;
            expect(error).toBeInstanceOf(FuiViewCreationError);
            const cause = (error as FuiViewCreationError).cause;
            expect(cause).toBeInstanceOf(FuiViewBindingRegistrationError);
            expect((cause as Error).message).toMatch(/runtime binding missing/);
            // 回滚：首次失败创建的 GComponent 与点击监听全部清理（attach 已注册点击，
            // binder 缺失后逆序退订；组件 dispose 一次）
            expect(createdComponents[0]!.disposed).toBe(1);
            expect(createdComponents[0]!.clickHandlers.size).toBe(0);

            // 安装 Feature：向 registrar 注册 Store + facade 的真实 binder
            const feature = createFeature(assembly.fuiViewBindingRegistrar, {
                confirm: () => confirm(),
                cancel: () => cancel(),
            });

            // 同一 assembly.uiHost 创建页面：成功 + 首次投影（初始关闭态隐藏内容）
            const page = adapter!.createPage("dialog", "normal", {
                packageName: "Demo",
                resName: "CloseDialog",
            });
            expect(page.disposed).toBe(false);
            expect(page.view).toBeDefined();
            const component = page.view as DialogComponent;
            expect(component.children.txt_content!.text).toBe("");
            expect(component.children.txt_content!.visible).toBe(false);

            // dispatch(open) → project → onState 写字段 → 引擎节点变化
            feature.store.dispatch({
                type: CLOSE_DIALOG_ACTIONS.OPEN,
                content: "确定要退出吗？",
            });
            expect(component.children.txt_content!.text).toBe("确定要退出吗？");
            expect(component.children.txt_content!.visible).toBe(true);
            expect(component.children.txt_title!.text).toBe("确认");

            // 点击上行：View 先 dispatch 纯 UI close action，再调用 facade
            expect(component.clickHandlers.size).toBe(2);
            component.clickHandlers.get("btn_confirm_bg")!();
            expect(confirm).toHaveBeenCalledTimes(1);
            // dispatch(confirm) 使 visible=false → 投影隐藏内容
            expect(component.children.txt_content!.visible).toBe(false);

            component.clickHandlers.get("btn_cancel_bg")!();
            expect(cancel).toHaveBeenCalledTimes(1);

            // 关闭页面后重开：Store 归 Feature（页面销毁只释放页面局部句柄），
            // 新页面绑定同一 Feature Store，再次 dispatch 仍生效（未绑定已释放 Store）
            adapter!.destroy(page);
            expect(page.disposed).toBe(true);

            const reopened = adapter!.createPage("dialog", "normal", {
                packageName: "Demo",
                resName: "CloseDialog",
            });
            expect(reopened.disposed).toBe(false);
            const reopenedComponent = reopened.view as DialogComponent;
            feature.store.dispatch({
                type: CLOSE_DIALOG_ACTIONS.OPEN,
                content: "重开后的内容",
            });
            expect(reopenedComponent.children.txt_content!.text).toBe("重开后的内容");
            expect(reopenedComponent.children.txt_content!.visible).toBe(true);

            // 先销毁所有打开页面，再 Feature dispose（保持 FuiView.dispose -> Store.dispose 顺序）
            adapter!.destroy(reopened);
            expect(reopened.disposed).toBe(true);
            feature.dispose();

            // 注销后 fail-fast：Feature dispose 先注销 binder registration 再释放 Store，
            // required 页面再次创建缺 binder 即 fail-fast（typed missing-binder）。Store
            // 释放归 Feature dispose，不声称由页面创建回滚——页面关闭/重开流程已证明 Store
            // 不随页面生命周期释放，此处失败归因于 registration 注销而非 Store 已释放。
            const afterDisposePage = adapter!.createPage("dialog", "normal", {
                packageName: "Demo",
                resName: "CloseDialog",
            });
            expect(afterDisposePage.disposed).toBe(true);
            const afterDisposeError = afterDisposePage.error;
            expect(afterDisposeError).toBeInstanceOf(FuiViewCreationError);
            const afterDisposeCause = (afterDisposeError as FuiViewCreationError).cause;
            expect(afterDisposeCause).toBeInstanceOf(FuiViewBindingRegistrationError);
            expect((afterDisposeCause as Error).message).toMatch(/runtime binding missing/);
            // 自检：恰好 4 次创建（首次失败、成功、重开、注销后失败），
            // 使下方 last 索引假设显式（断言失败即索引假设失效）
            expect(createdComponents).toHaveLength(4);
            // 回滚：本页新建 GComponent 与点击监听全部清理（组件已 dispose、点击已退订）
            const rolledBack = createdComponents[createdComponents.length - 1]!;
            expect(rolledBack.disposed).toBe(1);
            expect(rolledBack.clickHandlers.size).toBe(0);
        } finally {
            if (original === undefined) {
                delete g["__ai_game_kit_fui_components__"];
            } else {
                g["__ai_game_kit_fui_components__"] = original;
            }
        }
    });

    test("投影为纯函数：可独立单测", async () => {
        const demo = (await import(pathToFileURL(resolve(import.meta.dir, "../../../assets/samples/game_fui_demo/store.ts")).href)) as {
            projectCloseDialog: (state: { visible: boolean; content: string }) => { content: string; title: string };
            closeDialogReducer: (state: { visible: boolean; content: string }, action: { type: string }) => unknown;
        };
        expect(demo.projectCloseDialog({ visible: true, content: "hi" })).toEqual({
            content: "hi",
            title: "确认",
        });
        expect(demo.projectCloseDialog({ visible: false, content: "hi" })).toEqual({
            content: "",
            title: "",
        });
        const state = { visible: true, content: "x" };
        const next = demo.closeDialogReducer(state, { type: "confirm" });
        expect(next).toEqual({ visible: false, content: "x" });
        expect(state.visible).toBe(true); // 不可变
    });
});
