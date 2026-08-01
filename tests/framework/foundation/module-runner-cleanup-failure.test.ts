import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";

import type {
  ApplicationContext,
  Module,
} from "../../../assets/framework";
import { MemoryLogger } from "../support/MemoryLogger";

interface ModuleRunnerInstance {
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}

type ModuleRunnerConstructor = new (
  modules: readonly Module[],
  context: ApplicationContext,
) => ModuleRunnerInstance;

interface ModuleRunnerExports {
  readonly ModuleRunner: ModuleRunnerConstructor;
}

type LifecyclePhase = "initialize" | "start" | "stop" | "dispose";
type LifecycleFailures = Partial<Record<LifecyclePhase, Error>>;
type ErrorWithCause = Error & { readonly cause?: unknown };

const projectRoot = resolve(import.meta.dir, "../../..");
const moduleRunnerFile = resolve(
  projectRoot,
  "assets/framework/application/ModuleRunner.ts",
);
const context: ApplicationContext = {
  logger: new MemoryLogger(),
  state: "created",
};

async function loadModuleRunner(): Promise<ModuleRunnerConstructor> {
  const exports = (await import(
    pathToFileURL(moduleRunnerFile).href
  )) as ModuleRunnerExports;

  return exports.ModuleRunner;
}

function createModule(
  id: string,
  calls: string[],
  dependencies: readonly string[] = [],
  failures: LifecycleFailures = {},
): Module {
  const run = async (phase: LifecyclePhase): Promise<void> => {
    calls.push(`${id}:${phase}`);

    const failure = failures[phase];

    if (failure !== undefined) {
      throw failure;
    }
  };

  return {
    id,
    dependencies,
    initialize: () => run("initialize"),
    start: () => run("start"),
    stop: () => run("stop"),
    dispose: () => run("dispose"),
  };
}

async function captureRejection(
  operation: () => Promise<void>,
): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }

  throw new Error("Expected lifecycle operation to reject");
}

function containsError(error: unknown, expected: Error): boolean {
  const visited = new Set<Error>();
  let current = error;

  while (current instanceof Error && !visited.has(current)) {
    if (current === expected) {
      return true;
    }

    visited.add(current);
    current = (current as ErrorWithCause).cause;
  }

  return false;
}

describe("ModuleRunner cleanup failures", () => {
  test("continues stopping remaining modules after one stop fails", async () => {
    const ModuleRunner = await loadModuleRunner();
    const calls: string[] = [];
    const stopFailure = new Error("inventory stop failed");
    const logging = createModule("logging", calls);
    const inventory = createModule(
      "inventory",
      calls,
      [logging.id],
      { stop: stopFailure },
    );
    const gameplay = createModule("gameplay", calls, [inventory.id]);
    const runner = new ModuleRunner(
      [logging, inventory, gameplay],
      context,
    );

    await runner.initialize();
    await runner.start();
    calls.length = 0;

    const error = await captureRejection(() => runner.stop());

    expect(containsError(error, stopFailure)).toBe(true);
    expect(calls).toEqual([
      "gameplay:stop",
      "inventory:stop",
      "logging:stop",
    ]);
  });

  test("continues disposing remaining modules after one dispose fails", async () => {
    const ModuleRunner = await loadModuleRunner();
    const calls: string[] = [];
    const disposeFailure = new Error("inventory dispose failed");
    const logging = createModule("logging", calls);
    const inventory = createModule(
      "inventory",
      calls,
      [logging.id],
      { dispose: disposeFailure },
    );
    const gameplay = createModule("gameplay", calls, [inventory.id]);
    const runner = new ModuleRunner(
      [logging, inventory, gameplay],
      context,
    );

    await runner.initialize();
    calls.length = 0;

    const error = await captureRejection(() => runner.dispose());

    expect(containsError(error, disposeFailure)).toBe(true);
    expect(calls).toEqual([
      "gameplay:dispose",
      "inventory:dispose",
      "logging:dispose",
    ]);
  });

  test("preserves initialize failure when rollback dispose also fails", async () => {
    const ModuleRunner = await loadModuleRunner();
    const calls: string[] = [];
    const initializeFailure = new Error("gameplay initialize failed");
    const disposeFailure = new Error("inventory dispose failed");
    const logging = createModule("logging", calls);
    const inventory = createModule(
      "inventory",
      calls,
      [logging.id],
      { dispose: disposeFailure },
    );
    const gameplay = createModule(
      "gameplay",
      calls,
      [inventory.id],
      { initialize: initializeFailure },
    );
    const presentation = createModule(
      "presentation",
      calls,
      [gameplay.id],
    );
    const runner = new ModuleRunner(
      [logging, inventory, gameplay, presentation],
      context,
    );

    const error = await captureRejection(() => runner.initialize());

    expect(containsError(error, initializeFailure)).toBe(true);
    expect(calls).toEqual([
      "logging:initialize",
      "inventory:initialize",
      "gameplay:initialize",
      "inventory:dispose",
      "logging:dispose",
    ]);
  });

  test("preserves start failure when rollback stop also fails", async () => {
    const ModuleRunner = await loadModuleRunner();
    const calls: string[] = [];
    const startFailure = new Error("gameplay start failed");
    const stopFailure = new Error("inventory stop failed");
    const logging = createModule("logging", calls);
    const inventory = createModule(
      "inventory",
      calls,
      [logging.id],
      { stop: stopFailure },
    );
    const gameplay = createModule(
      "gameplay",
      calls,
      [inventory.id],
      { start: startFailure },
    );
    const presentation = createModule(
      "presentation",
      calls,
      [gameplay.id],
    );
    const runner = new ModuleRunner(
      [logging, inventory, gameplay, presentation],
      context,
    );

    await runner.initialize();
    calls.length = 0;

    const error = await captureRejection(() => runner.start());

    expect(containsError(error, startFailure)).toBe(true);
    expect(calls).toEqual([
      "logging:start",
      "inventory:start",
      "gameplay:start",
      "inventory:stop",
      "logging:stop",
      "presentation:dispose",
      "gameplay:dispose",
      "inventory:dispose",
      "logging:dispose",
    ]);
  });
});
