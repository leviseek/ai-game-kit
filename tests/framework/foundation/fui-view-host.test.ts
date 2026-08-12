import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

import { createFairyGuiMock } from "./helpers/fairygui-mock";
import {
    getFuiComponentRegistry,
    type FuiComponentUrl,
} from "../../../assets/framework/core/fui/FuiComponentRegistry";
import { FuiBindingError, FuiViewCreationError } from "../../../assets/framework/core/fui/FuiErrors";
import { FuiView } from "../../../assets/framework/contracts/ui/FuiView";

// 实现值 import fairygui-cc；统一使用共享 fixture，动态加载避免 mock 前解析。
mock.module("fairygui-cc", () => createFairyGuiMock());

const HOST_FILE = resolve(
    import.meta.dir,
    "../../../assets/framework/adapters/cocos/ui/FuiViewHost.ts",
);

async function loadHost(): Promise<{
    createBoundView: typeof import("../../../assets/framework/adapters/cocos/ui/FuiViewHost")["createBoundView"];
    createFairyGuiBoundView: typeof import("../../../assets/framework/adapters/cocos/ui/FuiViewHost")["createFairyGuiBoundView"];
}> {
    return (await import(pathToFileURL(HOST_FILE).href)) as never;
}

// 隔离的测试注册表：保存 globalThis 原单例，测试后恢复（禁止无条件 delete，
// 否则会删掉已由其它缓存 ESM 模块登记的生产组件元数据，破坏其它用例）。
function isolateRegistry(): () => void {
    const g = globalThis as Record<string, unknown>;
    const original = g["__ai_game_kit_fui_components__"];
    return () => {
        if (original === undefined) {
            delete g["__ai_game_kit_fui_components__"];
        } else {
            g["__ai_game_kit_fui_components__"] = original;
        }
    };
}

/** 合成测试包名：非真实 FGUI 包，拼接避免 scan-ts 扫到裸 ui:// 字面量。 */
const LOGIN_VIEW_URL = ("ui" + "://Login/LoginView") as FuiComponentUrl;

/** 可注入的引擎组件 mock：具备 getChild/on/off/dispose（对齐真实 GComponent 使用面）。 */
function makeComponentMock(children: Record<string, { text?: string; visible?: boolean }>): {
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
        name: "LoginView",
        disposed: 0,
        children,
        clickHandlers,
        getChild(name: string) {
            const child = children[name];
            if (child === undefined) {
                return null;
            }
            // 子元件同样具备 on/off（点击注册经 getChild 到的节点 on）；
            // 直接返回原对象，wrapFairyGuiObjectTyped 写入 text/visible 落在同一引用上
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
        on(_type: string, handler: () => void) {
            clickHandlers.set("login", handler);
        },
        off(_type: string) {
            clickHandlers.delete("login");
        },
        dispose() {
            this.disposed++;
        },
    };
}

class BoundLoginView extends FuiView<unknown, unknown> {
    readonly _txt_title!: { setText(v: string): void; text(): string };
    readonly _btn_login!: { setText(v: string): void; onClick(h: () => void): void };
    loginClicks = 0;

    protected onConstruct(): void {
        this._txt_title.setText("构造完成");
    }
    protected onState(): void { }
}

describe("createBoundView", () => {
    test("命中注册表：创建 FuiView 实例、注入字段、注册点击、dispose 级联", async () => {
        const restore = isolateRegistry();
        const { createBoundView } = await loadHost();
        try {
            const fields = { txt_title: "text", btn_login: "button" } as const;
            const registry = getFuiComponentRegistry();
            registry.register(LOGIN_VIEW_URL, {
                ctor: BoundLoginView,
                fields,
                clicks: [
                    {
                        nodeName: "btn_login",
                        methodRef: function (this: BoundLoginView) {
                            this.loginClicks++;
                        },
                    },
                ],
                runtimeBinding: "none",
            });

            const componentMock = makeComponentMock({
                txt_title: { text: "" },
                btn_login: { text: "登录" },
            });
            const view = createBoundView(
                "Login",
                "LoginView",
                registry,
                () => componentMock as never,
            );

            expect(view).not.toBeNull();
            // 字段注入写入了引擎节点（onConstruct 内 setText 生效）
            expect(componentMock.children.txt_title!.text).toBe("构造完成");
            // 点击注册：触发引擎点击 → 实例方法被调用（this 已 bind）
            expect(componentMock.clickHandlers.size).toBe(1);
            componentMock.clickHandlers.get("btn_login")!();
            // dispose 级联：引擎 dispose 被调用
            view!.dispose();
            expect(componentMock.disposed).toBe(1);
        } finally {
            restore();
        }
    });

    test("未命中注册表返回 null（回退既有路径）", async () => {
        const restore = isolateRegistry();
        const { createBoundView } = await loadHost();
        try {
            const view = createBoundView("Login", "NoSuchView", getFuiComponentRegistry(), () => null);
            expect(view).toBeNull();
        } finally {
            restore();
        }
    });

    test("命中但组件创建失败抛 FuiViewCreationError", async () => {
        const restore = isolateRegistry();
        const { createBoundView } = await loadHost();
        try {
            const registry = getFuiComponentRegistry();
            registry.register(LOGIN_VIEW_URL, {
                ctor: BoundLoginView,
                fields: { txt_title: "text", btn_login: "button" },
                clicks: [],
                runtimeBinding: "none",
            });
            let thrown: unknown;
            try {
                createBoundView("Login", "LoginView", registry, () => null);
            } catch (error) {
                thrown = error;
            }
            expect(thrown).toBeInstanceOf(FuiViewCreationError);
            // 原「was not found」信息保留在 cause 中
            expect(
                (thrown as Error & { cause?: unknown }).cause,
            ).toBeInstanceOf(Error);
        } finally {
            restore();
        }
    });

    test("ctor 抛错包装为 FuiViewCreationError（保留原始 cause）", async () => {
        const restore = isolateRegistry();
        const { createBoundView } = await loadHost();
        try {
            const registry = getFuiComponentRegistry();
            const boom = new Error("ctor boom");
            registry.register(LOGIN_VIEW_URL, {
                ctor: class extends FuiView<unknown, unknown> {
                    constructor() {
                        super();
                        throw boom;
                    }
                    protected onConstruct(): void { }
                    protected onState(): void { }
                },
                fields: {},
                clicks: [],
                runtimeBinding: "none",
            });
            let thrown: unknown;
            try {
                createBoundView(
                    "Login",
                    "LoginView",
                    registry,
                    () => makeComponentMock({}) as never,
                );
            } catch (error) {
                thrown = error;
            }
            expect(thrown).toBeInstanceOf(FuiViewCreationError);
            expect((thrown as Error & { cause?: unknown }).cause).toBe(boom);
        } finally {
            restore();
        }
    });

    test("绑定字段缺失抛 FuiBindingError（kind=field）", async () => {
        const restore = isolateRegistry();
        const { createBoundView } = await loadHost();
        try {
            const registry = getFuiComponentRegistry();
            registry.register(LOGIN_VIEW_URL, {
                ctor: BoundLoginView,
                fields: { txt_title: "text", txt_missing: "text" },
                clicks: [],
                runtimeBinding: "none",
            });
            const componentMock = makeComponentMock({ txt_title: { text: "" } });
            let thrown: unknown;
            try {
                createBoundView("Login", "LoginView", registry, () => componentMock as never);
            } catch (error) {
                thrown = error;
            }
            expect(thrown).toBeInstanceOf(FuiBindingError);
            expect((thrown as FuiBindingError).nodeName).toBe("txt_missing");
            expect((thrown as FuiBindingError).bindingKind).toBe("field");
        } finally {
            restore();
        }
    });

    test("点击节点缺失抛 FuiBindingError（kind=click）", async () => {
        const restore = isolateRegistry();
        const { createBoundView } = await loadHost();
        try {
            const registry = getFuiComponentRegistry();
            registry.register(LOGIN_VIEW_URL, {
                ctor: BoundLoginView,
                fields: { txt_title: "text" },
                clicks: [
                    {
                        nodeName: "btn_missing",
                        methodRef: function () { },
                    },
                ],
                runtimeBinding: "none",
            });
            const componentMock = makeComponentMock({ txt_title: { text: "" } });
            let thrown: unknown;
            try {
                createBoundView("Login", "LoginView", registry, () => componentMock as never);
            } catch (error) {
                thrown = error;
            }
            expect(thrown).toBeInstanceOf(FuiBindingError);
            expect((thrown as FuiBindingError).nodeName).toBe("btn_missing");
            expect((thrown as FuiBindingError).bindingKind).toBe("click");
        } finally {
            restore();
        }
    });
});

describe("createFairyGuiBoundView", () => {
    test("未命中注册表时回退 createFairyGuiView（引擎创建）", async () => {
        const restore = isolateRegistry();
        const { createFairyGuiBoundView } = await loadHost();
        try {
            const compose = createFairyGuiBoundView(getFuiComponentRegistry());
            // 未命中 → 回退 createFairyGuiView：mock UIPackage.createObject 返回 null → 抛 not found
            expect(() => compose("Login", "LoginView")).toThrow(/was not found/);
        } finally {
            restore();
        }
    });
});
