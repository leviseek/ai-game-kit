import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

import { createFairyGuiMock } from "./helpers/fairygui-mock";

// 实现值 import fairygui-cc；统一使用共享 fixture，动态加载避免 mock 前解析。
mock.module("fairygui-cc", () => createFairyGuiMock());

const HOST_FILE = resolve(
    import.meta.dir,
    "../../../assets/framework/adapters/cocos/ui/FuiViewHost.ts",
);

async function loadHost(): Promise<{
    createBoundView: typeof import("../../../assets/framework/adapters/cocos/ui/FuiViewHost")["createBoundView"];
    getBoundView: typeof import("../../../assets/framework/adapters/cocos/ui/FuiViewHost")["getBoundView"];
}> {
    return (await import(pathToFileURL(HOST_FILE).href)) as never;
}

function resetRegistry(): void {
    const g = globalThis as Record<string, unknown>;
    delete g["__ai_game_kit_fui_components__"];
}

/** 可注入的引擎组件 mock：具备 getChild/on/off/dispose（对齐真实 GComponent 使用面）。 */
function makeDialogComponent(children: Record<string, { text?: string; visible?: boolean }>): {
    name: string;
    disposed: number;
    getChild(name: string): unknown;
    on(type: string, handler: () => void, target?: unknown): void;
    off(type: string, handler?: () => void, target?: unknown): void;
    dispose(): void;
    children: Record<string, { text?: string; visible?: boolean }>;
    clickHandlers: Map<string, () => void>;
} {
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
        on() { },
        off() { },
        dispose() {
            this.disposed++;
        },
    };
}

describe("CloseDialog 示范静态页全链路集成", () => {
    test("dispatch → 投影 → 字段更新 → 引擎节点变化可观察；点击上行；dispose 幂等", async () => {
        resetRegistry();
        const { createBoundView, getBoundView } = await loadHost();
        try {
            // 动态加载演示模块：@FUIBind 在模块求值时登记注册表
            const demo = (await import(
                pathToFileURL(resolve(import.meta.dir, "../../../assets/samples/game_fui_demo/view/CloseDialog.ts")).href
            )) as {
                CloseDialog: new () => unknown;
            };
            void demo;

            const registry = (await import(
                pathToFileURL(resolve(import.meta.dir, "../../../assets/framework/core/fui/FuiComponentRegistry.ts")).href
            )) as {
                getFuiComponentRegistry: () => {
                    lookup(url: string): unknown;
                };
            };
            const entry = registry.getFuiComponentRegistry().lookup("ui" + "://Demo/CloseDialog");
            expect(entry).toBeDefined();

            const store = (await import(
                pathToFileURL(resolve(import.meta.dir, "../../../assets/samples/game_fui_demo/store.ts")).href
            )).createCloseDialogStore();
            const onConfirm = mock(() => {});
            const onCancel = mock(() => {});
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

            // 经 createBoundView 命中注册表创建绑定视图（字段注入 + FClick 注册）
            const view = createBoundView(
                "Demo",
                "CloseDialog",
                registry.getFuiComponentRegistry(),
                () => component as never,
            );
            expect(view).not.toBeNull();

            // 全链路：dispatch(open) → 投影 → onState 写字段 → 引擎节点变化
            const fuiView = getBoundView(view) as unknown as {
                bind(deps: {
                    store: unknown;
                    onConfirm: () => void;
                    onCancel: () => void;
                }): void;
                open(content: string): void;
                dispose(): void;
            };
            fuiView.bind({
                store,
                onConfirm,
                onCancel,
            });
            fuiView.open("确定要退出吗？");
            expect(component.children.txt_content!.text).toBe("确定要退出吗？");
            expect(component.children.txt_content!.visible).toBe(true);
            expect(component.children.txt_title!.text).toBe("确认");

            // 点击上行：FClick 注册的点击 → dispatch(confirm) + onConfirm 回调
            expect(component.clickHandlers.size).toBe(2);
            component.clickHandlers.get("btn_confirm_bg")!();
            expect(onConfirm).toHaveBeenCalledTimes(1);
            // dispatch(confirm) 使 visible=false → 投影隐藏内容
            expect(component.children.txt_content!.visible).toBe(false);

            component.clickHandlers.get("btn_cancel_bg")!();
            expect(onCancel).toHaveBeenCalledTimes(1);

            // dispose 幂等：第二次不再触发引擎 dispose 副作用之外的操作
            view!.dispose();
            view!.dispose();
            expect(component.disposed).toBe(1);
        } finally {
            resetRegistry();
        }
    });

    test("投影为纯函数：可独立单测", async () => {
        const demo = (await import(
            pathToFileURL(resolve(import.meta.dir, "../../../assets/samples/game_fui_demo/store.ts")).href
        )) as {
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

    test("Store 装配模块：start 创建、stop dispose", async () => {
        const demo = (await import(
            pathToFileURL(resolve(import.meta.dir, "../../../assets/samples/game_fui_demo/store.ts")).href
        )) as {
            createCloseDialogStoreModule: () => {
                start(): void;
                stop(): void;
                getHandle(): {
                    store: { dispatch(a: unknown): void; dispose(): void };
                    open(content: string): void;
                } | undefined;
            };
        };

        const module = demo.createCloseDialogStoreModule();
        expect(module.getHandle()).toBeUndefined();

        module.start();
        const handle = module.getHandle();
        expect(handle).toBeDefined();
        handle!.open("欢迎");
        expect(handle!.store).toBeDefined();

        module.stop();
        expect(module.getHandle()).toBeUndefined();
        // stop 后 dispatch 不再通知（dispose 语义，不抛错）
        expect(() => handle!.store.dispatch({ type: "open", content: "x" })).not.toThrow();
    });
});
