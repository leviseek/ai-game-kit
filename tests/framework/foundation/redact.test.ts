import { describe, expect, test } from "bun:test";

import type { LogRecord } from "../../../assets/framework";
import { createScopedLogger } from "../../../assets/framework/diagnostics/logging/ScopedLogger";
import { redactContext, redactRecord } from "../../../assets/framework/diagnostics/logging/redact";

describe("diagnostics redact sensitive fields", () => {
    test("redacts sensitive keys while preserving non-sensitive context", () => {
        const context = {
            token: "abc123",
            apiKey: "k-123",
            message: "hello",
            userId: 7,
        };
        const result = redactContext(context);

        expect(result.token).toBe("[REDACTED]");
        expect(result.apiKey).toBe("[REDACTED]");
        expect(result.message).toBe("hello");
        expect(result.userId).toBe(7);
    });

    test("redacts sensitive keys inside nested context objects", () => {
        const context = {
            phase: "start",
            credentials: { password: "pw", sessionToken: "s-1" },
        };
        const result = redactContext(context);

        expect(result.phase).toBe("start");
        expect((result.credentials as { password: unknown }).password).toBe("[REDACTED]");
        expect((result.credentials as { sessionToken: unknown }).sessionToken).toBe("[REDACTED]");
    });

    test("does not mutate the original context", () => {
        const context = { token: "abc123", message: "hello" };
        redactContext(context);

        expect(context).toEqual({ token: "abc123", message: "hello" });
    });

    test("redacts sensitive fields in a log record while preserving record shape", () => {
        const record: LogRecord = {
            level: "error",
            message: "save failed",
            timestamp: 1,
            scope: "app.inventory",
            context: { secret: "s", userId: 7 },
        };
        const result = redactRecord(record);

        expect(result.level).toBe("error");
        expect(result.message).toBe("save failed");
        expect(result.timestamp).toBe(1);
        expect(result.scope).toBe("app.inventory");
        expect(result.context.secret).toBe("[REDACTED]");
        expect(result.context.userId).toBe(7);
    });

    test("leaves the error instance untouched in a redacted record", () => {
        const error = new Error("save failed");
        const record: LogRecord = {
            level: "error",
            message: "save failed",
            timestamp: 1,
            scope: "app.inventory",
            context: { secret: "s" },
            error,
        };
        const result = redactRecord(record);

        expect(result.error).toBe(error);
        expect(result.context.secret).toBe("[REDACTED]");
    });

    test("redacts sensitive keys inside a nested error context object", () => {
        const errorContext = {
            moduleId: "inventory",
            phase: "start",
            credentials: { token: "t-9", password: "pw" },
        };
        const result = redactContext(errorContext);

        expect(result.moduleId).toBe("inventory");
        expect(result.phase).toBe("start");
        expect((result.credentials as { token: unknown }).token).toBe("[REDACTED]");
        expect((result.credentials as { password: unknown }).password).toBe("[REDACTED]");
    });

    test("redacts delimiter-variant sensitive keys", () => {
        const context = { api_key: "a", API_KEY: "b", "api-key": "c" };
        const result = redactContext(context);

        expect(result.api_key).toBe("[REDACTED]");
        expect(result.API_KEY).toBe("[REDACTED]");
        expect(result["api-key"]).toBe("[REDACTED]");
    });

    test("does not redact keys that merely contain a sensitive word", () => {
        const context = { promptTokens: 42, tokenCount: 3, passwordPolicy: "x" };
        const result = redactContext(context);

        expect(result.promptTokens).toBe(42);
        expect(result.tokenCount).toBe(3);
        expect(result.passwordPolicy).toBe("x");
    });

    test("redacts sensitive keys inside arrays", () => {
        const context = {
            steps: [{ token: "t-1" }, { ok: true, secret: "s" }],
        };
        const result = redactContext(context);

        const steps = result.steps as Array<{
            readonly token?: unknown;
            readonly ok?: unknown;
            readonly secret?: unknown;
        }>;
        expect(steps[0]?.token).toBe("[REDACTED]");
        expect(steps[1]?.ok).toBe(true);
        expect(steps[1]?.secret).toBe("[REDACTED]");
    });

    test("preserves non-plain objects instead of flattening them", () => {
        const timestamp = new Date("2024-01-01T00:00:00Z");
        const context = { at: timestamp, note: "kept" };
        const result = redactContext(context);

        expect(result.at).toBe(timestamp);
        expect(result.note).toBe("kept");
    });

    test("guards against circular references without throwing", () => {
        const circular: Record<string, unknown> = { name: "loop" };
        circular.self = circular;
        const context = { inner: circular };
        const result = redactContext(context);

        const inner = result.inner as Record<string, unknown>;
        expect(inner.name).toBe("loop");
        expect(inner.self).toBe("[Circular]");
    });

    test("guards against self-referencing arrays without throwing", () => {
        const circular: unknown[] = [];
        circular.push(circular);
        const context = { steps: circular };
        const result = redactContext(context);

        expect(result.steps).toEqual(["[Circular]"]);
    });

    test("guards against circular references reached through arrays without throwing", () => {
        const inner: Record<string, unknown> = { name: "loop" };
        const steps: unknown[] = [inner];
        inner.list = steps;
        const context = { steps };
        const result = redactContext(context);

        expect(result.steps).toEqual([{ name: "loop", list: "[Circular]" }]);
    });

    test("ScopedLogger applies an injected filter to every record shape", () => {
        const records: LogRecord[] = [];
        const logger = createScopedLogger((record) => records.push(record), "application", { source: "boot", secret: "root-secret" }, redactRecord);

        logger.child("inventory", { moduleId: "inventory" }).info("inventory started", { token: "call-token", phase: "start" });

        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({
            level: "info",
            message: "inventory started",
            scope: "application.inventory",
            context: {
                source: "boot",
                moduleId: "inventory",
                phase: "start",
            },
        });
        expect(records[0]?.context.secret).toBe("[REDACTED]");
        expect(records[0]?.context.token).toBe("[REDACTED]");
    });
});
