import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import type { ILogContext, ILogger, ILogRecord } from "../../../assets/framework";
import { EnumLogLevel } from "../../../assets/framework";

type ErrorWithCause = Error & { readonly cause?: unknown };

interface LoggerProbe {
    readonly logger: ILogger;
    readonly records: readonly ILogRecord[];
}

const projectRoot = resolve(import.meta.dir, "../../..");
const frameworkRoot = resolve(projectRoot, "assets/framework");
const frameworkEntry = resolve(frameworkRoot, "index.ts");
const loggerContractFile = resolve(frameworkRoot, "contracts/interfaces/ILogger.ts");
const contractImportScanner = new Bun.Transpiler({ loader: "ts" });

function joinScopes(parentScope: string, childScope: string): string {
    return parentScope.length === 0 ? childScope : `${parentScope}.${childScope}`;
}

function createLoggerProbe(scope: string, context: ILogContext = {}, records: ILogRecord[] = []): LoggerProbe {
    const baseContext = { ...context };

    const record = (level: EnumLogLevel, message: string, callContext: ILogContext = {}, error?: Error): void => {
        records.push({
            level,
            message,
            timestamp: Date.now(),
            scope,
            context: { ...baseContext, ...callContext },
            error,
        });
    };

    const logger: ILogger = {
        debug: (message, callContext) => record(EnumLogLevel.Debug, message, callContext),
        info: (message, callContext) => record(EnumLogLevel.Info, message, callContext),
        warn: (message, callContext) => record(EnumLogLevel.Warn, message, callContext),
        error: (message, callContext, error) => record(EnumLogLevel.Error, message, callContext, error),
        child: (childScope, childContext = {}) => createLoggerProbe(joinScopes(scope, childScope), { ...baseContext, ...childContext }, records).logger,
    };

    return { logger, records };
}

describe("ILogger contract", () => {
    test("is exposed as a Cocos-free Framework contract", () => {
        expect(existsSync(loggerContractFile)).toBe(true);

        const contractSource = readFileSync(loggerContractFile, "utf8");
        const contractImports = contractImportScanner.scan(contractSource).imports.map(({ path }) => path);

        expect(contractImports.some((path) => path === "cc" || path.startsWith("cc/"))).toBe(false);
        expect(contractImports.some((path) => path.includes("/application/") || path.startsWith("application/"))).toBe(false);

        const frameworkSource = readFileSync(frameworkEntry, "utf8");

        expect(frameworkSource).toMatch(/export\s+type\s*\{[\s\S]*?\}\s*from\s*["']\.\/contracts\/interfaces\/ILogger["']/);
    });

    test("supports debug, info, warn and error levels", () => {
        const { logger, records } = createLoggerProbe("application");

        logger.debug("debug message");
        logger.info("info message");
        logger.warn("warn message");
        logger.error("error message");

        expect(records.map(({ level }) => level)).toEqual(["debug", "info", "warn", "error"]);
    });

    test("records the required structured fields", () => {
        const { logger, records } = createLoggerProbe("application", {
            applicationState: "initializing",
        });
        const before = Date.now();

        logger.info("application is starting", { phase: "initialize" });

        const after = Date.now();
        const record = records[0];

        expect(record).toBeDefined();
        expect(record?.level).toBe("info");
        expect(record?.message).toBe("application is starting");
        expect(record?.timestamp).toBeGreaterThanOrEqual(before);
        expect(record?.timestamp).toBeLessThanOrEqual(after);
        expect(record?.scope).toBe("application");
        expect(record?.context).toEqual({
            applicationState: "initializing",
            phase: "initialize",
        });
        expect(record?.error).toBeUndefined();
    });

    test("child inherits scope and context without changing its parent", () => {
        const parentContext: ILogContext = { applicationState: "running" };
        const { logger: parent, records } = createLoggerProbe("application", parentContext);
        const child = parent.child("inventory", { moduleId: "inventory" });

        parent.info("parent record");
        child.info("child record");

        const parentRecord = records[0];
        const childRecord = records[1];

        expect(parentRecord?.scope).toBe("application");
        expect(parentRecord?.context).toEqual({ applicationState: "running" });
        expect(childRecord?.scope).toContain("application");
        expect(childRecord?.scope).toContain("inventory");
        expect(childRecord?.context).toEqual({
            applicationState: "running",
            moduleId: "inventory",
        });
        expect(parentContext).toEqual({ applicationState: "running" });
    });

    test("preserves Error name, message, stack and cause", () => {
        const cause = new Error("socket unavailable");
        const error = new Error("module start failed") as ErrorWithCause;
        Object.defineProperty(error, "cause", { value: cause });
        const { logger, records } = createLoggerProbe("application.inventory");

        logger.error("inventory failed", { phase: "start" }, error);

        const recordedError = records[0]?.error as ErrorWithCause | undefined;

        expect(recordedError).toBe(error);
        expect(recordedError?.name).toBe("Error");
        expect(recordedError?.message).toBe("module start failed");
        expect(recordedError?.stack).toBe(error.stack);
        expect(recordedError?.cause).toBe(cause);
    });
});
