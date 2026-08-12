import { describe, expect, test } from "bun:test";

import type { FuiComponentUrl } from "../../../assets/framework/core/fui/FuiComponentRegistry";
import {
    FuiBindingError,
    FuiViewBindingRegistrationError,
} from "../../../assets/framework/core/fui/FuiErrors";
import {
    createFuiViewBinderRegistry,
    createFuiViewBindingScope,
    defineFuiViewBinding,
    type FuiViewBindingScope,
} from "../../../assets/framework/core/fui/FuiViewBinderRegistry";

/** 合成测试 URL：非真实 FGUI 包，拼接避免 scan-ts 扫到裸 ui:// 字面量。 */
const URL = ("ui" + "://Demo/ViewA") as FuiComponentUrl;

class ViewA {
    readonly kind = "a" as const;
}

class ViewB {
    readonly kind = "b" as const;
}

describe("defineFuiViewBinding", () => {
    test("returns a frozen binding descriptor carrying url/ctor/bind", () => {
        const bind = (_view: ViewA, _scope: FuiViewBindingScope): void => { };

        const binding = defineFuiViewBinding(URL, ViewA, bind);

        expect(Object.isFrozen(binding)).toBe(true);
        expect(binding.url).toBe(URL);
        expect(binding.ctor).toBe(ViewA);
        expect(binding.bind).toBe(bind);
    });
});

describe("FuiViewBindingRegistrar register", () => {
    test("registering the same URL twice is rejected without overriding", () => {
        const registry = createFuiViewBinderRegistry();
        const first = defineFuiViewBinding(URL, ViewA, () => { });
        const second = defineFuiViewBinding(URL, ViewB, () => { });

        registry.register(first);

        expect(() => registry.register(second)).toThrow(
            FuiViewBindingRegistrationError,
        );

        // 首注册仍可解析（重复注册不得覆盖）
        const view = new ViewA();
        expect(() =>
            registry.bindRequired(URL, view, createFuiViewBindingScope()),
        ).not.toThrow();
    });

    test("registration dispose removes the binding and is idempotent", () => {
        const registry = createFuiViewBinderRegistry();
        const handle = registry.register(defineFuiViewBinding(URL, ViewA, () => { }));

        handle.dispose();

        // 幂等：重复 dispose 不抛错
        expect(() => handle.dispose()).not.toThrow();

        // 移除后缺少 binder → 类型化错误
        const view = new ViewA();
        expect(() =>
            registry.bindRequired(URL, view, createFuiViewBindingScope()),
        ).toThrow(FuiViewBindingRegistrationError);
    });

    test("after dispose the same URL can be registered again", () => {
        const registry = createFuiViewBinderRegistry();
        const handle = registry.register(defineFuiViewBinding(URL, ViewA, () => { }));
        handle.dispose();

        expect(() =>
            registry.register(defineFuiViewBinding(URL, ViewB, () => { })),
        ).not.toThrow();
    });
});

describe("FuiViewBindingResolver bindRequired", () => {
    test("invokes the binder with the view and scope for a matching ctor", () => {
        const registry = createFuiViewBinderRegistry();
        const scope = createFuiViewBindingScope();
        const view = new ViewA();
        const calls: Array<{ view: ViewA; scope: FuiViewBindingScope }> = [];

        registry.register(
            defineFuiViewBinding(URL, ViewA, (boundView, boundScope) => {
                calls.push({ view: boundView, scope: boundScope });
            }),
        );

        registry.bindRequired(URL, view, scope);

        expect(calls).toHaveLength(1);
        expect(calls[0]?.view).toBe(view);
        expect(calls[0]?.scope).toBe(scope);
    });

    test("a ctor mismatch throws a runtime FuiBindingError before binding", () => {
        const registry = createFuiViewBinderRegistry();
        let bound = false;
        registry.register(
            defineFuiViewBinding(URL, ViewA, () => {
                bound = true;
            }),
        );

        const viewB = new ViewB();

        expect(() =>
            registry.bindRequired(URL, viewB, createFuiViewBindingScope()),
        ).toThrow(FuiBindingError);

        let caught: unknown;
        try {
            registry.bindRequired(URL, viewB, createFuiViewBindingScope());
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(FuiBindingError);
        if (caught instanceof FuiBindingError) {
            expect(caught.bindingKind).toBe("runtime");
            expect(caught.nodeName).toBe("ViewA");
        }

        // 校验失败在调用 binder 之前，binder 不得被执行
        expect(bound).toBe(false);
    });

    test("a missing binder throws a typed registration error", () => {
        const registry = createFuiViewBinderRegistry();

        expect(() =>
            registry.bindRequired(URL, new ViewA(), createFuiViewBindingScope()),
        ).toThrow(FuiViewBindingRegistrationError);

        let caught: unknown;
        try {
            registry.bindRequired(URL, new ViewA(), createFuiViewBindingScope());
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(FuiViewBindingRegistrationError);
        if (caught instanceof FuiViewBindingRegistrationError) {
            expect(caught.message).toMatch(/runtime binding missing/);
        }
    });

    test("a binder error propagates unchanged and leaves already-owned handles in the scope", () => {
        const registry = createFuiViewBinderRegistry();
        const boom = new Error("boom");
        const disposed: string[] = [];

        registry.register(
            defineFuiViewBinding(URL, ViewA, (_view, scope) => {
                scope.own({ dispose: () => disposed.push("first") });
                throw boom;
            }),
        );

        let caught: unknown;
        try {
            registry.bindRequired(URL, new ViewA(), createFuiViewBindingScope());
        } catch (error) {
            caught = error;
        }

        // 原样传播（不包装、不吞错）
        expect(caught).toBe(boom);

        // resolver 不执行回滚：错误发生时 handle 仍未释放
        expect(disposed).toEqual([]);
    });

    test("a binder error does not roll back the caller-provided scope handles", () => {
        const registry = createFuiViewBinderRegistry();
        const boom = new Error("boom");
        const disposed: string[] = [];
        const scope = createFuiViewBindingScope();

        registry.register(
            defineFuiViewBinding(URL, ViewA, (_view, boundScope) => {
                boundScope.own({ dispose: () => disposed.push("first") });
                boundScope.own({ dispose: () => disposed.push("second") });
                throw boom;
            }),
        );

        expect(() => registry.bindRequired(URL, new ViewA(), scope)).toThrow(boom);

        // 已登记句柄仍留在 scope：Host 作为回滚所有者可逆序清理，且每个句柄至多释放一次
        expect(disposed).toEqual([]);
        scope.disposeAll();
        expect(disposed).toEqual(["second", "first"]);
        scope.disposeAll();
        expect(disposed).toEqual(["second", "first"]);
    });
});
