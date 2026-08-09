import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";

import type {
    LogContext,
    Logger,
    LogRecord,
} from "../../../assets/framework";

type LogRecordSink = (record: LogRecord) => void;

type CreateScopedLogger = (
    sink: LogRecordSink,
    scope?: string,
    context?: LogContext,
) => Logger;

interface ScopedLoggerModule {
    readonly createScopedLogger?: CreateScopedLogger;
}

const projectRoot = resolve(import.meta.dir, "../../..");
const scopedLoggerFile = resolve(
    projectRoot,
    "assets/framework/diagnostics/logging/ScopedLogger.ts",
);

async function loadCreateScopedLogger(): Promise<CreateScopedLogger> {
    expect(existsSync(scopedLoggerFile)).toBe(true);

    const module = (await import(
        pathToFileURL(scopedLoggerFile).href
    )) as ScopedLoggerModule;

    expect(typeof module.createScopedLogger).toBe("function");

    return module.createScopedLogger as CreateScopedLogger;
}

describe("child logger", () => {
    test("inherits its complete parent scope", async () => {
        const createScopedLogger = await loadCreateScopedLogger();
        const records: LogRecord[] = [];
        const root = createScopedLogger((record) => records.push(record), "application");

        root.child("inventory").child("sync").info("sync started");

        expect(records[0]?.scope).toBe("application.inventory.sync");
    });

    test("merges parent, child and call context with nearest values winning", async () => {
        const createScopedLogger = await loadCreateScopedLogger();
        const records: LogRecord[] = [];
        const root = createScopedLogger(
            (record) => records.push(record),
            "application",
            { applicationState: "running", shared: "parent" },
        );
        const child = root.child("inventory", {
            moduleId: "inventory",
            shared: "child",
        });

        child.info("inventory started", {
            phase: "start",
            shared: "call",
        });

        expect(records[0]?.context).toEqual({
            applicationState: "running",
            moduleId: "inventory",
            phase: "start",
            shared: "call",
        });
    });

    test("does not mutate its parent scope or context", async () => {
        const createScopedLogger = await loadCreateScopedLogger();
        const records: LogRecord[] = [];
        const parentContext: LogContext = {
            applicationState: "running",
            shared: "parent",
        };
        const parent = createScopedLogger(
            (record) => records.push(record),
            "application",
            parentContext,
        );

        parent.child("inventory", { shared: "child" }).info("child record");
        parent.info("parent record");

        expect(records[1]?.scope).toBe("application");
        expect(records[1]?.context).toEqual({
            applicationState: "running",
            shared: "parent",
        });
        expect(parentContext).toEqual({
            applicationState: "running",
            shared: "parent",
        });
    });
});
