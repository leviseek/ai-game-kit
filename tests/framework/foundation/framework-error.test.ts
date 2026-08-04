import { describe, expect, test } from "bun:test";

import {
  FrameworkError,
  isRecoverableError,
} from "../../../assets/framework/core/errors/FrameworkError";

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
    expect(((error as ErrorWithCause).cause as ErrorWithCause).cause).toBe(
      rootCause,
    );
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
    expect(isRecoverableError(new FrameworkError("save corrupted"))).toBe(
      false,
    );
    expect(isRecoverableError(new Error("plain error"))).toBe(false);
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
