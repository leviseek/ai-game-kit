import { describe, expect, test } from "bun:test";

import { ModuleLifecycleError } from "../../../assets/framework";

type ErrorWithCause = Error & { readonly cause?: unknown };

describe("ModuleLifecycleError", () => {
    test("uses native Error cause semantics without making cause enumerable", () => {
        const cause = new Error("inventory start failed");
        const error = new ModuleLifecycleError("inventory", "start", cause);
        const causeDescriptor = Object.getOwnPropertyDescriptor(error, "cause");

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(ModuleLifecycleError);
        expect((error as ErrorWithCause).cause).toBe(cause);
        expect(causeDescriptor).toEqual({
            value: cause,
            writable: true,
            enumerable: false,
            configurable: true,
        });
    });
});
