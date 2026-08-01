import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";

import type {
  LogContext,
  Logger,
  LogLevel,
  LogRecord,
} from "../../../assets/framework";

interface ConsoleOutput {
  debug(record: LogRecord): void;
  info(record: LogRecord): void;
  warn(record: LogRecord): void;
  error(record: LogRecord): void;
}

type ConsoleLoggerConstructor = new (
  output?: ConsoleOutput,
  scope?: string,
  context?: LogContext,
) => Logger;

interface MemoryLogger extends Logger {
  readonly records: readonly LogRecord[];
}

type MemoryLoggerConstructor = new (
  scope?: string,
  context?: LogContext,
) => MemoryLogger;

interface ConsoleLoggerModule {
  readonly ConsoleLogger?: ConsoleLoggerConstructor;
}

interface MemoryLoggerModule {
  readonly MemoryLogger?: MemoryLoggerConstructor;
}

const projectRoot = resolve(import.meta.dir, "../../..");
const consoleLoggerFile = resolve(
  projectRoot,
  "assets/framework/diagnostics/logging/ConsoleLogger.ts",
);
const memoryLoggerFile = resolve(
  projectRoot,
  "tests/framework/support/MemoryLogger.ts",
);

async function loadConsoleLogger(): Promise<ConsoleLoggerConstructor> {
  expect(existsSync(consoleLoggerFile)).toBe(true);

  const module = (await import(
    pathToFileURL(consoleLoggerFile).href
  )) as ConsoleLoggerModule;

  expect(typeof module.ConsoleLogger).toBe("function");

  return module.ConsoleLogger as ConsoleLoggerConstructor;
}

async function loadMemoryLogger(): Promise<MemoryLoggerConstructor> {
  expect(existsSync(memoryLoggerFile)).toBe(true);

  const module = (await import(
    pathToFileURL(memoryLoggerFile).href
  )) as MemoryLoggerModule;

  expect(typeof module.MemoryLogger).toBe("function");

  return module.MemoryLogger as MemoryLoggerConstructor;
}

describe("Logger outputs", () => {
  test("ConsoleLogger sends each structured record to its matching level", async () => {
    const ConsoleLogger = await loadConsoleLogger();
    const calls: Array<{ readonly method: LogLevel; readonly record: LogRecord }> =
      [];
    const output: ConsoleOutput = {
      debug: (record) => calls.push({ method: "debug", record }),
      info: (record) => calls.push({ method: "info", record }),
      warn: (record) => calls.push({ method: "warn", record }),
      error: (record) => calls.push({ method: "error", record }),
    };
    const logger = new ConsoleLogger(output, "application", { source: "boot" });

    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");
    logger.child("inventory", { moduleId: "inventory" }).info(
      "inventory started",
      { phase: "start" },
    );

    expect(calls.slice(0, 4).map(({ method }) => method)).toEqual([
      "debug",
      "info",
      "warn",
      "error",
    ]);
    expect(calls.slice(0, 4).map(({ record }) => record.level)).toEqual([
      "debug",
      "info",
      "warn",
      "error",
    ]);
    expect(calls[4]?.record).toMatchObject({
      level: "info",
      message: "inventory started",
      scope: "application.inventory",
      context: {
        source: "boot",
        moduleId: "inventory",
        phase: "start",
      },
    });
  });

  test("MemoryLogger retains records for level, scope and context assertions", async () => {
    const MemoryLogger = await loadMemoryLogger();
    const logger = new MemoryLogger("application", { source: "test" });

    logger.child("inventory", { moduleId: "inventory" }).warn(
      "inventory delayed",
      { phase: "start" },
    );

    expect(logger.records).toHaveLength(1);
    expect(logger.records[0]).toMatchObject({
      level: "warn",
      message: "inventory delayed",
      scope: "application.inventory",
      context: {
        source: "test",
        moduleId: "inventory",
        phase: "start",
      },
    });
  });
});
