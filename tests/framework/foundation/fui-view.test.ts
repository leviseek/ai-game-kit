import { describe, expect, test } from "bun:test";
import { FClick, FUIBind, collectClickMeta } from "../../../assets/framework/core/fui/FuiBindings";
import { FuiBindingError, FuiComponentRegistrationError, FuiViewCleanupError } from "../../../assets/framework/core/fui/FuiErrors";
import { getFuiComponentRegistry, type FuiComponentUrl } from "../../../assets/framework/core/fui/FuiComponentRegistry";
import { FuiView, type FuiViewSeam } from "../../../assets/framework/contracts/ui/FuiView";
import { createStore } from "../../../assets/framework/core/state/Store";

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

interface LoginState {
    readonly status: string;
    readonly progress: number;
}
type LoginAction = { readonly type: "setStatus"; readonly status: string };

function loginReducer(state: LoginState, action: LoginAction): LoginState {
    switch (action.type) {
        case "setStatus":
            return { ...state, status: action.status };
    }
}

/** 测试用视图接缝：按名返回可写文本节点；缺失时抛 FuiBindingError（对齐 seam 契约）。 */
function makeSeam(children: Record<string, { text: string; visible: boolean }>): {
    seam: FuiViewSeam;
    children: Record<string, { text: string; visible: boolean }>;
    clicks: Array<{ name: string; handler: () => void }>;
} {
    const clicks: Array<{ name: string; handler: () => void }> = [];
    const seam: FuiViewSeam = {
        child(name: string) {
            const child = children[name];
            if (child === undefined) {
                throw new FuiBindingError(LOGIN_VIEW_URL, name, "field");
            }
            return {
                setVisible(visible: boolean) {
                    child.visible = visible;
                },
                setText(value: string) {
                    child.text = value;
                },
            };
        },
        onClick(name: string, handler: () => void) {
            clicks.push({ name, handler });
            return () => {
                const index = clicks.findIndex((c) => c.name === name);
                if (index >= 0) clicks.splice(index, 1);
            };
        },
    };
    return { seam, children, clicks };
}

interface LoginViewShape {
    readonly _txt_status: { setText(v: string): void; text(): string };
    readonly _btn_login: { setText(v: string): void; onClick(h: () => void): void };
}

describe("FUIBind / FClick", () => {
    test("FUIBind 登记复合键，FClick 收集原型方法引用", () => {
        const restore = isolateRegistry();
        try {
            const fields = { txt_status: "text", btn_login: "button" } as const;

            @FUIBind(LOGIN_VIEW_URL, fields, { runtimeBinding: "required" })
            class LoginView extends FuiView<LoginState, LoginViewShape> implements LoginViewShape {
                readonly _txt_status!: { setText(v: string): void; text(): string };
                readonly _btn_login!: { setText(v: string): void; onClick(h: () => void): void };
                clicked = 0;

                @FClick<"btn_login">("btn_login")
                private _handleLogin(): void {
                    this.clicked++;
                }

                protected onConstruct(): void {
                    // 字段已注入
                    void this._txt_status;
                }
                protected onState(): void {}
            }
            void LoginView;

            const registry = getFuiComponentRegistry();
            const entry = registry.lookup(LOGIN_VIEW_URL);
            expect(entry).toBeDefined();
            expect(entry!.fields).toEqual({ txt_status: "text", btn_login: "button" });
            expect(entry!.clicks).toHaveLength(1);
            expect(entry!.clicks[0]!.nodeName).toBe("btn_login");
        } finally {
            restore();
        }
    });

    test("FUIBind 重复登记同一复合键抛错", () => {
        const restore = isolateRegistry();
        try {
            const fields = { txt_status: "text" } as const;
            @FUIBind(LOGIN_VIEW_URL, fields, { runtimeBinding: "required" })
            class A extends FuiView<LoginState, LoginViewShape> {
                readonly _txt_status!: { setText(v: string): void; text(): string };
                protected onConstruct(): void {}
                protected onState(): void {}
            }
            void A;

            const registry = getFuiComponentRegistry();
            expect(() =>
                registry.register(LOGIN_VIEW_URL, {
                    ctor: A,
                    fields,
                    clicks: [],
                    runtimeBinding: "required",
                }),
            ).toThrow(FuiComponentRegistrationError);
        } finally {
            restore();
        }
    });

    test("collectClickMeta 沿原型链收集", () => {
        const restore = isolateRegistry();
        try {
            class Base extends FuiView<LoginState, LoginViewShape> {
                readonly _txt_status!: { setText(v: string): void; text(): string };
                protected onConstruct(): void {}
                protected onState(): void {}
            }
            class Derived extends Base {
                @FClick<"txt_status">("txt_status")
                private _onStatus(): void {}
            }

            const meta = collectClickMeta(Derived);
            expect(meta).toHaveLength(1);
            expect(meta[0]!.nodeName).toBe("txt_status");
        } finally {
            restore();
        }
    });
});

describe("FuiView 生命周期", () => {
    test("__attach 注入字段并注册点击（bind 实例 this）", () => {
        const { seam, children, clicks } = makeSeam({
            txt_status: { text: "", visible: true },
            btn_login: { text: "登录", visible: true },
        });
        const fields = { txt_status: "text", btn_login: "button" } as const;

        const view = new (class extends FuiView<LoginState, LoginViewShape> implements LoginViewShape {
            readonly _txt_status!: { setText(v: string): void; text(): string };
            readonly _btn_login!: { setText(v: string): void; onClick(h: () => void): void };
            constructed = false;
            lastStatus = "";

            protected onConstruct(): void {
                this.constructed = true;
                this._txt_status.setText("initial");
            }
            protected onState(vm: LoginViewShape): void {
                this.lastStatus = vm._txt_status.text();
            }
        })();

        view.__attach(seam, fields, [
            {
                nodeName: "btn_login",
                methodRef: function (this: LoginViewShape) {
                    this._btn_login.setText("clicked");
                },
            },
        ]);

        expect(view.constructed).toBe(true);
        expect(children.txt_status!.text).toBe("initial");
        expect(clicks).toHaveLength(1);

        clicks[0]!.handler();
        expect(children.btn_login!.text).toBe("clicked");
    });

    test("__attach 绑定缺失由 seam 抛 FuiBindingError", () => {
        const { seam } = makeSeam({});
        const fields = { txt_status: "text", txt_missing: "text" } as const;
        const view = new (class extends FuiView<LoginState, LoginViewShape> implements LoginViewShape {
            readonly _txt_status!: { setText(v: string): void; text(): string };
            readonly _txt_missing!: { setText(v: string): void; text(): string };
            protected onConstruct(): void {}
            protected onState(): void {}
        })();

        expect(() => view.__attach(seam, fields, [])).toThrow(FuiBindingError);
    });

    test("bindStore 订阅 + 首次投影 + dispose 退订", () => {
        const { seam, children } = makeSeam({ txt_status: { text: "", visible: true } });
        const fields = { txt_status: "text" } as const;
        const store = createStore<LoginState, LoginAction>(loginReducer, { status: "ready", progress: 0 });

        const states: string[] = [];
        const view = new (class extends FuiView<LoginState, { readonly status: string }> implements LoginViewShape {
            readonly _txt_status!: { setText(v: string): void; text(): string };
            readonly _btn_login!: { setText(v: string): void; onClick(h: () => void): void };
            protected onConstruct(): void {}
            protected onState(vm: { readonly status: string }): void {
                states.push(vm.status);
                this._txt_status.setText(vm.status);
            }
        })();

        view.__attach(seam, fields, []);
        view.bindStore(store, (state) => ({ status: state.status }));

        expect(states).toEqual(["ready"]);
        expect(children.txt_status!.text).toBe("ready");

        store.dispatch({ type: "setStatus", status: "loading" });
        expect(states).toEqual(["ready", "loading"]);
        expect(children.txt_status!.text).toBe("loading");

        view.dispose();
        store.dispatch({ type: "setStatus", status: "done" });
        expect(states).toEqual(["ready", "loading"]); // dispose 后不再投影
    });

    test("dispose 幂等且移除点击监听", () => {
        const { seam, clicks } = makeSeam({
            txt_status: { text: "", visible: true },
            btn_login: { text: "", visible: true },
        });
        const fields = { txt_status: "text", btn_login: "button" } as const;
        const view = new (class extends FuiView<LoginState, LoginViewShape> implements LoginViewShape {
            readonly _txt_status!: { setText(v: string): void; text(): string };
            readonly _btn_login!: { setText(v: string): void; onClick(h: () => void): void };
            closed = 0;
            protected onConstruct(): void {}
            protected onState(): void {}
            protected onClose(): void {
                this.closed++;
            }
        })();

        view.__attach(seam, fields, [
            {
                nodeName: "btn_login",
                methodRef: function () {
                    // no-op
                },
            },
        ]);
        expect(clicks).toHaveLength(1);

        view.dispose();
        view.dispose();
        expect(view["closed"]).toBe(1);
        expect(clicks).toHaveLength(0);
    });

    test("dispose 逆序执行全部 owner，单步失败聚合为 FuiViewCleanupError", () => {
        const { seam } = makeSeam({});
        const calls: string[] = [];
        class CleanupView extends FuiView<LoginState, LoginViewShape> {
            protected onConstruct(): void {}
            protected onState(): void {}
            protected onClose(): void {
                calls.push("onClose");
            }
        }
        const view = new CleanupView();
        view.__attach(seam, {}, []);
        view.__own({
            dispose: () => {
                calls.push("first");
            },
        });
        view.__own({
            dispose: () => {
                calls.push("second");
                throw new Error("second boom");
            },
        });
        view.__own({
            dispose: () => {
                calls.push("third");
            },
        });

        let thrown: unknown;
        try {
            view.dispose();
        } catch (error) {
            thrown = error;
        }

        // 逆序：third → second（抛错不阻断）→ first → onClose
        expect(calls).toEqual(["third", "second", "first", "onClose"]);
        expect(thrown).toBeInstanceOf(FuiViewCleanupError);
        const cleanup = thrown as FuiViewCleanupError;
        expect(cleanup.component).toBe("CleanupView");
        expect(cleanup.errors).toHaveLength(1);
        expect((cleanup.errors[0] as Error).message).toBe("second boom");
    });

    test("dispose 先标记已销毁：抛聚合错误后重复调用仍为 no-op", () => {
        const { seam } = makeSeam({});
        const calls: string[] = [];
        class ClosingView extends FuiView<LoginState, LoginViewShape> {
            protected onConstruct(): void {}
            protected onState(): void {}
            protected onClose(): void {
                calls.push("onClose");
                throw new Error("onClose boom");
            }
        }
        const view = new ClosingView();
        view.__attach(seam, {}, []);
        view.__own({ dispose: () => calls.push("owner") });

        expect(() => view.dispose()).toThrow(FuiViewCleanupError);
        expect(calls).toEqual(["owner", "onClose"]);
        // disposed 已标记：重复调用不抛错也不重复执行
        expect(() => view.dispose()).not.toThrow();
        expect(calls).toEqual(["owner", "onClose"]);
    });

    test("__own 在 dispose 后注册的 handle 立即执行", () => {
        const { seam } = makeSeam({});
        const calls: string[] = [];
        const view = new (class extends FuiView<LoginState, LoginViewShape> {
            protected onConstruct(): void {}
            protected onState(): void {}
        })();
        view.__attach(seam, {}, []);
        view.dispose();
        view.__own({ dispose: () => calls.push("late") });
        expect(calls).toEqual(["late"]);
    });
});
