import { describe, expect, test } from "bun:test";

import type { LogRecord } from "../../../assets/framework";
import { createScopedLogger } from "../../../assets/framework/diagnostics/logging/ScopedLogger";
import {
  redactContext,
  redactRecord,
} from "../../../assets/framework/diagnostics/logging/redact";

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
    expect((result.credentials as { password: unknown }).password).toBe(
      "[REDACTED]",
    );
    expect((result.credentials as { sessionToken: unknown }).sessionToken).toBe(
      "[REDACTED]",
    );
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

  test("redacts sensitive fields in error context as well", () => {
    const errorContext = {
      moduleId: "inventory",
      phase: "start",
      credentials: { token: "t-9", password: "pw" },
    };
    const result = redactContext(errorContext);

    expect(result.moduleId).toBe("inventory");
    expect(result.phase).toBe("start");
    expect((result.credentials as { token: unknown }).token).toBe(
      "[REDACTED]",
    );
    expect((result.credentials as { password: unknown }).password).toBe(
      "[REDACTED]",
    );
  });

  test("ScopedLogger applies an injected filter to every record shape", () => {
    const records: LogRecord[] = [];
    const logger = createScopedLogger(
      (record) => records.push(record),
      "application",
      { source: "boot", secret: "root-secret" },
      redactRecord,
    );

    logger.child("inventory", { moduleId: "inventory" }).info(
      "inventory started",
      { token: "call-token", phase: "start" },
    );

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
