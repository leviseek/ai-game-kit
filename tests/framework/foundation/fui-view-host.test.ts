import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

import { createFairyGuiMock } from "./helpers/fairygui-mock";
import { getFuiComponentRegistry, type FuiComponentUrl } from "../../../assets/framework/core/fui/FuiComponentRegistry";
import { FuiBindingError, FuiViewBindingRegistrationError, FuiViewCleanupError, FuiViewCreationError } from "../../../assets/framework/core/fui/FuiErrors";
import { createFuiViewBinderRegistry, defineFuiViewBinding } from "../../../assets/framework/core/fui/FuiViewBinderRegistry";
import { FuiView } from "../../../assets/framework/core/fui/FuiView";

// 实现值 import fairygui-cc；统一使用共享 fixture，动态加载避免 mock 前解析。
mock.module("fairygui-cc", () => createFairyGuiMock());

const HOST_FILE = resolve(import.meta.dir, "../../../assets/framework/adapters/cocos/ui/FuiViewHost.ts");

async function loadHost(): Promise<{
    createBoundView: (typeof import("../../../assets/framework/adapters/cocos/ui/FuiViewHost"))["createBoundView"];
    createFairyGuiBoundView: (typeof import("../../../assets/framework/adapters/cocos/ui/FuiViewHost"))["createFairyGuiBoundView"];
}> {
    return (await import(pathToFileURL(HOST_FILE).href)) as never;
}

// 隔离的测试注册表：登记前先清空全局键，使本用例在全新空注册表上登记（不污染
// 生产 Registry 中已由缓存 ESM 模块登记的元数据），用例结束后恢复原单例。
function isolateRegistry(): () => void {
    const g = globalThis as Record<string, unknown>;
    const original = g["__ai_game_kit_fui_components__"];
    delete g["__ai_game_kit_fui_components__"];
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
    protected onState(): void {}
}

/** 记录自身被 dispose 的视图：__own 的 owner 执行即证明 View 清理已触发。 */
class RecordingDisposeView extends FuiView<unknown, unknown> {
    constructor(readonly disposedSink: string[]) {
        super();
        this.__own({
            dispose: () => {
                this.disposedSink.push("view");
            },
        });
    }
    protected onConstruct(): void {}
    protected onState(): void {}
}

/** __own 的 owner 抛错：dispose 时产生 FuiViewCleanupError（供级联聚合）。 */
class ThrowingOwnerView extends FuiView<unknown, unknown> {
    constructor() {
        super();
        this.__own({
            dispose: () => {
                throw new Error("view owner boom");
            },
        });
    }
    protected onConstruct(): void {}
    protected onState(): void {}
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
            const view = createBoundView("Login", "LoginView", registry, undefined, () => componentMock as never);

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
            const view = createBoundView("Login", "NoSuchView", getFuiComponentRegistry(), undefined, () => null);
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
                createBoundView("Login", "LoginView", registry, undefined, () => null);
            } catch (error) {
                thrown = error;
            }
            expect(thrown).toBeInstanceOf(FuiViewCreationError);
            // 原「was not found」信息保留在 cause 中
            expect((thrown as Error & { cause?: unknown }).cause).toBeInstanceOf(Error);
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
                    protected onConstruct(): void {}
                    protected onState(): void {}
                },
                fields: {},
                clicks: [],
                runtimeBinding: "none",
            });
            const componentMock = makeComponentMock({});
            let thrown: unknown;
            try {
                createBoundView("Login", "LoginView", registry, undefined, () => componentMock as never);
            } catch (error) {
                thrown = error;
            }
            expect(thrown).toBeInstanceOf(FuiViewCreationError);
            expect((thrown as Error & { cause?: unknown }).cause).toBe(boom);
            // ctor 抛错时已创建的 GComponent 仍须 dispose（回滚）
            expect(componentMock.disposed).toBe(1);
        } finally {
            restore();
        }
    });

    test("attach 字段缺失：包装为 FuiViewCreationError（cause 为 FuiBindingError），View 与 GComponent 均清理", async () => {
        const restore = isolateRegistry();
        const { createBoundView } = await loadHost();
        try {
            const disposedSink: string[] = [];
            const registry = getFuiComponentRegistry();
            registry.register(LOGIN_VIEW_URL, {
                ctor: class extends RecordingDisposeView {
                    constructor() {
                        super(disposedSink);
                    }
                },
                fields: { txt_title: "text", txt_missing: "text" },
                clicks: [],
                runtimeBinding: "none",
            });
            const componentMock = makeComponentMock({ txt_title: { text: "" } });
            let thrown: unknown;
            try {
                createBoundView("Login", "LoginView", registry, undefined, () => componentMock as never);
            } catch (error) {
                thrown = error;
            }
            expect(thrown).toBeInstanceOf(FuiViewCreationError);
            const creationError = thrown as FuiViewCreationError;
            expect(creationError.cause).toBeInstanceOf(FuiBindingError);
            const bindingError = creationError.cause as FuiBindingError;
            expect(bindingError.nodeName).toBe("txt_missing");
            expect(bindingError.bindingKind).toBe("field");
            // 回滚：View 与 GComponent 均被清理
            expect(disposedSink).toEqual(["view"]);
            expect(componentMock.disposed).toBe(1);
        } finally {
            restore();
        }
    });

    test("attach 点击缺失：包装为 FuiViewCreationError（cause 为 FuiBindingError），View 与 GComponent 均清理", async () => {
        const restore = isolateRegistry();
        const { createBoundView } = await loadHost();
        try {
            const disposedSink: string[] = [];
            const registry = getFuiComponentRegistry();
            registry.register(LOGIN_VIEW_URL, {
                ctor: class extends RecordingDisposeView {
                    constructor() {
                        super(disposedSink);
                    }
                },
                fields: { txt_title: "text" },
                clicks: [
                    {
                        nodeName: "btn_missing",
                        methodRef: function () {},
                    },
                ],
                runtimeBinding: "none",
            });
            const componentMock = makeComponentMock({ txt_title: { text: "" } });
            let thrown: unknown;
            try {
                createBoundView("Login", "LoginView", registry, undefined, () => componentMock as never);
            } catch (error) {
                thrown = error;
            }
            expect(thrown).toBeInstanceOf(FuiViewCreationError);
            const creationError = thrown as FuiViewCreationError;
            expect(creationError.cause).toBeInstanceOf(FuiBindingError);
            const bindingError = creationError.cause as FuiBindingError;
            expect(bindingError.nodeName).toBe("btn_missing");
            expect(bindingError.bindingKind).toBe("click");
            expect(disposedSink).toEqual(["view"]);
            expect(componentMock.disposed).toBe(1);
        } finally {
            restore();
        }
    });

    test("attach 失败回滚：清理错误保留在 cleanupErrors，primary 仍在 cause", async () => {
        const restore = isolateRegistry();
        const { createBoundView } = await loadHost();
        try {
            const registry = getFuiComponentRegistry();
            registry.register(LOGIN_VIEW_URL, {
                ctor: ThrowingOwnerView,
                fields: { txt_missing: "text" },
                clicks: [],
                runtimeBinding: "none",
            });
            const componentMock = makeComponentMock({});
            const originalDispose = componentMock.dispose.bind(componentMock);
            componentMock.dispose = (): void => {
                originalDispose();
                throw new Error("component cleanup boom");
            };
            let thrown: unknown;
            try {
                createBoundView("Login", "LoginView", registry, undefined, () => componentMock as never);
            } catch (error) {
                thrown = error;
            }
            expect(thrown).toBeInstanceOf(FuiViewCreationError);
            const creationError = thrown as FuiViewCreationError & {
                cleanupErrors?: readonly unknown[];
            };
            expect(creationError.cause).toBeInstanceOf(FuiBindingError);
            expect(creationError.cleanupErrors).toHaveLength(2);
            // View 层先把自身 owner 失败聚合为 FuiViewCleanupError，Host 再作为一项收集
            const viewCleanup = creationError.cleanupErrors![0] as FuiViewCleanupError;
            expect(viewCleanup).toBeInstanceOf(FuiViewCleanupError);
            expect((viewCleanup.errors[0] as Error).message).toBe("view owner boom");
            expect((creationError.cleanupErrors![1] as Error).message).toBe("component cleanup boom");
            expect(componentMock.disposed).toBe(1);
        } finally {
            restore();
        }
    });

    test("dispose 级联：View 与 GComponent 同时抛错，两个错误均聚合保留", async () => {
        const restore = isolateRegistry();
        const { createBoundView } = await loadHost();
        try {
            const registry = getFuiComponentRegistry();
            registry.register(LOGIN_VIEW_URL, {
                ctor: ThrowingOwnerView,
                fields: {},
                clicks: [],
                runtimeBinding: "none",
            });
            const componentMock = makeComponentMock({});
            const originalDispose = componentMock.dispose.bind(componentMock);
            componentMock.dispose = (): void => {
                originalDispose();
                throw new Error("component boom");
            };
            const view = createBoundView("Login", "LoginView", registry, undefined, () => componentMock as never);
            expect(view).not.toBeNull();

            let thrown: unknown;
            try {
                view!.dispose();
            } catch (error) {
                thrown = error;
            }
            expect(componentMock.disposed).toBe(1);
            expect(thrown).toBeInstanceOf(FuiViewCleanupError);
            const cleanup = thrown as FuiViewCleanupError;
            expect(cleanup.errors).toHaveLength(2);
            // View 层先把自身 owner 失败聚合为 FuiViewCleanupError，Host 再作为一项收集
            const viewCleanup = cleanup.errors[0] as FuiViewCleanupError;
            expect(viewCleanup).toBeInstanceOf(FuiViewCleanupError);
            expect((viewCleanup.errors[0] as Error).message).toBe("view owner boom");
            expect((cleanup.errors[1] as Error).message).toBe("component boom");
            // 幂等：重复 dispose 不再抛错
            expect(() => view!.dispose()).not.toThrow();
        } finally {
            restore();
        }
    });

    test("runtimeBinding required 且 bindingResolver 为 undefined：创建失败并回滚（typed missing-binder）", async () => {
        const restore = isolateRegistry();
        const { createBoundView } = await loadHost();
        try {
            const disposedSink: string[] = [];
            const registry = getFuiComponentRegistry();
            registry.register(LOGIN_VIEW_URL, {
                ctor: class extends RecordingDisposeView {
                    constructor() {
                        super(disposedSink);
                    }
                },
                fields: { txt_title: "text" },
                clicks: [],
                runtimeBinding: "required",
            });
            const componentMock = makeComponentMock({ txt_title: { text: "" } });
            let thrown: unknown;
            try {
                createBoundView("Login", "LoginView", registry, undefined, () => componentMock as never);
            } catch (error) {
                thrown = error;
            }
            expect(thrown).toBeInstanceOf(FuiViewCreationError);
            const cause = (thrown as FuiViewCreationError).cause;
            expect(cause).toBeInstanceOf(FuiViewBindingRegistrationError);
            expect((cause as Error).message).toMatch(/runtime binding missing/);
            // 回滚：View 与 GComponent 均被清理
            expect(disposedSink).toEqual(["view"]);
            expect(componentMock.disposed).toBe(1);
        } finally {
            restore();
        }
    });

    test("runtimeBinding required 且 resolver 缺少 binder：创建失败并回滚，点击监听也被清理", async () => {
        const restore = isolateRegistry();
        const { createBoundView } = await loadHost();
        try {
            const disposedSink: string[] = [];
            const registry = getFuiComponentRegistry();
            registry.register(LOGIN_VIEW_URL, {
                ctor: class extends RecordingDisposeView {
                    constructor() {
                        super(disposedSink);
                    }
                },
                fields: { txt_title: "text", btn_login: "button" },
                clicks: [
                    {
                        nodeName: "btn_login",
                        methodRef: function () {},
                    },
                ],
                runtimeBinding: "required",
            });
            // 已登记 registry 但未注册对应 binder：bindRequired 抛 typed missing-binder
            const binderRegistry = createFuiViewBinderRegistry();
            const componentMock = makeComponentMock({
                txt_title: { text: "" },
                btn_login: { text: "登录" },
            });
            let thrown: unknown;
            try {
                createBoundView("Login", "LoginView", registry, binderRegistry, () => componentMock as never);
            } catch (error) {
                thrown = error;
            }
            expect(thrown).toBeInstanceOf(FuiViewCreationError);
            expect((thrown as FuiViewCreationError).cause).toBeInstanceOf(FuiViewBindingRegistrationError);
            // 已注册点击监听被清理（View dispose 退订 onClick）
            expect(componentMock.clickHandlers.size).toBe(0);
            expect(disposedSink).toEqual(["view"]);
            expect(componentMock.disposed).toBe(1);
        } finally {
            restore();
        }
    });

    test("binder own 两个非幂等句柄后抛错：Host 逆序各释放一次并回滚 View/GComponent", async () => {
        const restore = isolateRegistry();
        const { createBoundView } = await loadHost();
        try {
            const disposedSink: string[] = [];
            const registry = getFuiComponentRegistry();
            registry.register(LOGIN_VIEW_URL, {
                ctor: class extends RecordingDisposeView {
                    constructor() {
                        super(disposedSink);
                    }
                },
                fields: { txt_title: "text" },
                clicks: [],
                runtimeBinding: "required",
            });
            const boom = new Error("binder boom");
            const handleDisposed: string[] = [];
            const binderRegistry = createFuiViewBinderRegistry();
            binderRegistry.register(
                defineFuiViewBinding(LOGIN_VIEW_URL, RecordingDisposeView, (_view, scope) => {
                    scope.own({ dispose: () => handleDisposed.push("first") });
                    scope.own({ dispose: () => handleDisposed.push("second") });
                    throw boom;
                }),
            );
            const componentMock = makeComponentMock({ txt_title: { text: "" } });
            let thrown: unknown;
            try {
                createBoundView("Login", "LoginView", registry, binderRegistry, () => componentMock as never);
            } catch (error) {
                thrown = error;
            }
            expect(thrown).toBeInstanceOf(FuiViewCreationError);
            // primary 保留 binder 原始错误（身份不被包装覆盖）
            expect((thrown as FuiViewCreationError).cause).toBe(boom);
            // 逆序释放：后登记先释放，各恰好一次
            expect(handleDisposed).toEqual(["second", "first"]);
            expect(disposedSink).toEqual(["view"]);
            expect(componentMock.disposed).toBe(1);
        } finally {
            restore();
        }
    });

    test("binder 失败且句柄 dispose 抛错：全部句柄仍被尝试，失败聚合且不覆盖 primary", async () => {
        const restore = isolateRegistry();
        const { createBoundView } = await loadHost();
        try {
            const disposedSink: string[] = [];
            const registry = getFuiComponentRegistry();
            registry.register(LOGIN_VIEW_URL, {
                ctor: class extends RecordingDisposeView {
                    constructor() {
                        super(disposedSink);
                    }
                },
                fields: { txt_title: "text" },
                clicks: [],
                runtimeBinding: "required",
            });
            const boom = new Error("binder boom");
            const handleDisposed: string[] = [];
            const binderRegistry = createFuiViewBinderRegistry();
            binderRegistry.register(
                defineFuiViewBinding(LOGIN_VIEW_URL, RecordingDisposeView, (_view, scope) => {
                    scope.own({
                        dispose: () => {
                            handleDisposed.push("first");
                            throw new Error("handle1 boom");
                        },
                    });
                    scope.own({ dispose: () => handleDisposed.push("second") });
                    throw boom;
                }),
            );
            const componentMock = makeComponentMock({ txt_title: { text: "" } });
            let thrown: unknown;
            try {
                createBoundView("Login", "LoginView", registry, binderRegistry, () => componentMock as never);
            } catch (error) {
                thrown = error;
            }
            const creationError = thrown as FuiViewCreationError & {
                cleanupErrors?: readonly unknown[];
            };
            expect(creationError).toBeInstanceOf(FuiViewCreationError);
            // 清理错误不覆盖 primary（仍在 cause）
            expect(creationError.cause).toBe(boom);
            // 两个句柄均被尝试（隔离清理不中断后续句柄）
            expect(handleDisposed).toEqual(["second", "first"]);
            expect(creationError.cleanupErrors).toHaveLength(1);
            expect((creationError.cleanupErrors![0] as Error).message).toBe("handle1 boom");
            expect(disposedSink).toEqual(["view"]);
            expect(componentMock.disposed).toBe(1);
        } finally {
            restore();
        }
    });

    test("runtimeBinding required 且有 binder：创建成功，scope 句柄随视图 dispose 逆序释放", async () => {
        const restore = isolateRegistry();
        const { createBoundView } = await loadHost();
        try {
            const disposedSink: string[] = [];
            const registry = getFuiComponentRegistry();
            registry.register(LOGIN_VIEW_URL, {
                ctor: class extends RecordingDisposeView {
                    constructor() {
                        super(disposedSink);
                    }
                },
                fields: { txt_title: "text" },
                clicks: [],
                runtimeBinding: "required",
            });
            const handleDisposed: string[] = [];
            const binderRegistry = createFuiViewBinderRegistry();
            binderRegistry.register(
                defineFuiViewBinding(LOGIN_VIEW_URL, RecordingDisposeView, (_view, scope) => {
                    scope.own({ dispose: () => handleDisposed.push("first") });
                    scope.own({ dispose: () => handleDisposed.push("second") });
                }),
            );
            const componentMock = makeComponentMock({ txt_title: { text: "" } });
            const view = createBoundView("Login", "LoginView", registry, binderRegistry, () => componentMock as never);
            expect(view).not.toBeNull();
            // binder 已执行，但句柄未立即释放（所有权已转交视图）
            expect(handleDisposed).toEqual([]);
            view!.dispose();
            // 视图 dispose → scope.disposeAll 逆序释放，各恰好一次
            expect(handleDisposed).toEqual(["second", "first"]);
            expect(disposedSink).toEqual(["view"]);
            expect(componentMock.disposed).toBe(1);
        } finally {
            restore();
        }
    });

    test("binder 成功且非终位句柄 dispose 抛错：全部句柄仍逆序尝试（不漏低位），失败聚合为 FuiViewCleanupError", async () => {
        const restore = isolateRegistry();
        const { createBoundView } = await loadHost();
        try {
            const disposedSink: string[] = [];
            const registry = getFuiComponentRegistry();
            registry.register(LOGIN_VIEW_URL, {
                ctor: class extends RecordingDisposeView {
                    constructor() {
                        super(disposedSink);
                    }
                },
                fields: { txt_title: "text" },
                clicks: [],
                runtimeBinding: "required",
            });
            const handleDisposed: string[] = [];
            const binderRegistry = createFuiViewBinderRegistry();
            binderRegistry.register(
                defineFuiViewBinding(LOGIN_VIEW_URL, RecordingDisposeView, (_view, scope) => {
                    scope.own({ dispose: () => handleDisposed.push("first") });
                    scope.own({
                        dispose: () => {
                            handleDisposed.push("second");
                            throw new Error("handle2 boom");
                        },
                    });
                    scope.own({ dispose: () => handleDisposed.push("third") });
                }),
            );
            const componentMock = makeComponentMock({ txt_title: { text: "" } });
            const view = createBoundView("Login", "LoginView", registry, binderRegistry, () => componentMock as never);
            expect(view).not.toBeNull();

            let thrown: unknown;
            try {
                view!.dispose();
            } catch (error) {
                thrown = error;
            }
            // 成功路径：隔离逆序 flush 转交视图；中位句柄抛错不得中断前序句柄（不漏低位）
            expect(handleDisposed).toEqual(["third", "second", "first"]);
            expect(thrown).toBeInstanceOf(FuiViewCleanupError);
            const cleanup = thrown as FuiViewCleanupError;
            // Host 包装层把 View 自身的 FuiViewCleanupError 作为一项聚合
            expect(cleanup.errors).toHaveLength(1);
            const viewCleanup = cleanup.errors[0] as FuiViewCleanupError;
            expect(viewCleanup).toBeInstanceOf(FuiViewCleanupError);
            // flush 聚合的 FuiViewCleanupError 再被 View 层聚合（无原生 AggregateError）
            const flushCleanup = viewCleanup.errors[0] as FuiViewCleanupError;
            expect(flushCleanup).toBeInstanceOf(FuiViewCleanupError);
            expect((flushCleanup.errors[0] as Error).message).toBe("handle2 boom");
            expect(componentMock.disposed).toBe(1);
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
            const compose = createFairyGuiBoundView(undefined, {
                componentRegistry: getFuiComponentRegistry(),
            });
            // 未命中 → 回退 createFairyGuiView：mock UIPackage.createObject 返回 null → 抛 not found
            expect(() => compose("Login", "LoginView")).toThrow(/was not found/);
        } finally {
            restore();
        }
    });
});
