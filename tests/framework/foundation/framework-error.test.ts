import { describe, expect, test } from "bun:test";

import { FrameworkError, isRecoverableError } from "../../../assets/framework/core/errors/FrameworkError";
import { ModuleLifecycleError } from "../../../assets/framework/application/ModuleLifecycleError";
import { ApplicationStateError } from "../../../assets/framework/application/ApplicationStateError";
import type { FuiComponentUrl } from "../../../assets/framework/core/fui/FuiComponentRegistry";
import { FuiBindingError, FuiComponentRegistrationError, FuiViewBindingRegistrationError, FuiViewCleanupError, FuiViewCreationError } from "../../../assets/framework/core/fui/FuiErrors";

type ErrorWithCause = Error & { readonly cause?: unknown };

describe("FrameworkError nested cause", () => {
    test("preserves a full nested cause chain to the root cause", () => {
        const rootCause = new Error("disk io failed");
        const middleCause = new Error("save failed", { cause: rootCause });
        const error = new FrameworkError("inventory save failed", {
            cause: middleCause,
        });

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(FrameworkError);
        expect((error as ErrorWithCause).cause).toBe(middleCause);
        expect(((error as ErrorWithCause).cause as ErrorWithCause).cause).toBe(rootCause);
    });

    test("uses native Error cause semantics without making cause enumerable", () => {
        const cause = new Error("underlying failure");
        const error = new FrameworkError("operation failed", { cause });
        const causeDescriptor = Object.getOwnPropertyDescriptor(error, "cause");

        expect((error as ErrorWithCause).cause).toBe(cause);
        expect(causeDescriptor).toEqual({
            value: cause,
            writable: true,
            enumerable: false,
            configurable: true,
        });
    });
});

describe("FrameworkError recoverability classification", () => {
    test("defaults to non-recoverable when classification is omitted", () => {
        const error = new FrameworkError("operation failed");

        expect(error.recoverable).toBe(false);
    });

    test("carries an explicit recoverable classification", () => {
        const retryable = new FrameworkError("resource temporarily unavailable", {
            recoverable: true,
        });
        const fatal = new FrameworkError("save corrupted", { recoverable: false });

        expect(retryable.recoverable).toBe(true);
        expect(fatal.recoverable).toBe(false);
    });

    test("isRecoverableError classifies framework errors and ignores others", () => {
        expect(
            isRecoverableError(
                new FrameworkError("resource temporarily unavailable", {
                    recoverable: true,
                }),
            ),
        ).toBe(true);
        expect(isRecoverableError(new FrameworkError("save corrupted"))).toBe(false);
        expect(isRecoverableError(new Error("plain error"))).toBe(false);
    });

    test("isRecoverableError classifies migrated subclasses by explicit flag", () => {
        expect(isRecoverableError(new ModuleLifecycleError("inventory", "start", new Error("retry")))).toBe(false);
    });
});

describe("FrameworkError subclass name preservation", () => {
    test("migrated subclasses keep their own error name", () => {
        expect(new ApplicationStateError("running").name).toBe("ApplicationStateError");
        expect(new ModuleLifecycleError("inventory", "start", new Error("boom")).name).toBe("ModuleLifecycleError");
        expect(new FrameworkError("generic").name).toBe("FrameworkError");
    });
});

describe("FrameworkError module and phase context", () => {
    test("carries module and phase context for locating the failure", () => {
        const error = new FrameworkError("module start failed", {
            moduleId: "inventory",
            phase: "start",
        });

        expect(error.moduleId).toBe("inventory");
        expect(error.phase).toBe("start");
    });

    test("optionally carries a component context", () => {
        const error = new FrameworkError("loader failed", {
            component: "resource-loader",
        });

        expect(error.component).toBe("resource-loader");
    });
});

describe("FrameworkError subclass cause propagation", () => {
    test("ApplicationStateError optionally carries a cause", () => {
        const cause = new Error("state transition blocked");
        const error = new ApplicationStateError("stopping", { cause });

        expect((error as ErrorWithCause).cause).toBe(cause);
        expect(error.currentState).toBe("stopping");
        expect(error.name).toBe("ApplicationStateError");
    });

    test("ApplicationStateError remains compatible without a cause", () => {
        const error = new ApplicationStateError("running");

        expect((error as ErrorWithCause).cause).toBeUndefined();
        expect(error.currentState).toBe("running");
    });
});

describe("FuiViewCleanupError", () => {
    test("extends FrameworkError and carries the component context", () => {
        const error = new FuiViewCleanupError("CloseDialog", [new Error("first")]);

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(FrameworkError);
        expect(error.component).toBe("CloseDialog");
        expect(error.name).toBe("FuiViewCleanupError");
        expect(error.recoverable).toBe(false);
    });

    test("freezes a full copy of the errors array", () => {
        const first = new Error("first");
        const second = new Error("second");
        const error = new FuiViewCleanupError("CloseDialog", [first, second]);

        expect(error.errors).toEqual([first, second]);
        expect(Object.isFrozen(error.errors)).toBe(true);

        // 保存的是快照副本而非原数组引用：外部后续变更不影响内部 errors
        const source = [first];
        const fromSource = new FuiViewCleanupError("CloseDialog", source);
        source.push(second);
        expect(fromSource.errors).toEqual([first]);
    });

    test("preserves the first cause for the call chain", () => {
        const first = new Error("first failure");
        const error = new FuiViewCleanupError("CloseDialog", [first, new Error("second failure")]);

        expect((error as ErrorWithCause).cause).toBe(first);
    });
});

describe("FuiErrors error family", () => {
    test("all FUI error classes derive from FrameworkError", () => {
        const url = ("ui" + "://Login/LoginView") as FuiComponentUrl;

        expect(new FuiComponentRegistrationError(url)).toBeInstanceOf(FrameworkError);
        expect(new FuiViewBindingRegistrationError(url)).toBeInstanceOf(FrameworkError);
        expect(new FuiViewCreationError(url, new Error("component creation failed"))).toBeInstanceOf(FrameworkError);
        expect(new FuiBindingError(url, "txt_title", "field")).toBeInstanceOf(FrameworkError);
        expect(new FuiBindingError(url, "btn_login", "click")).toBeInstanceOf(FrameworkError);
    });
});
