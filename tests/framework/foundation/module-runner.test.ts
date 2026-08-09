import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";

import type {
    ApplicationContext,
    Module,
    ModuleRuntimeState,
} from "../../../assets/framework";
import { MemoryLogger } from "../support/MemoryLogger";

interface ModuleRunnerInstance {
    initialize(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    dispose(): Promise<void>;
    getState(moduleId: string): ModuleRuntimeState | undefined;
}

type ModuleRunnerConstructor = new (
    modules: readonly Module[],
    context: ApplicationContext,
) => ModuleRunnerInstance;

interface ModuleRunnerExports {
    readonly ModuleRunner?: ModuleRunnerConstructor;
}

const projectRoot = resolve(import.meta.dir, "../../..");
const moduleRunnerFile = resolve(
    projectRoot,
    "assets/framework/application/ModuleRunner.ts",
);

const context: ApplicationContext = {
    logger: new MemoryLogger(),
    state: "created",
};

function createModule(
    id: string,
    calls: string[],
    dependencies: readonly string[] = [],
): Module {
    return {
        id,
        dependencies,
        initialize: async () => { calls.push(`${id}:initialize`); },
        start: async () => { calls.push(`${id}:start`); },
        stop: async () => { calls.push(`${id}:stop`); },
        dispose: async () => { calls.push(`${id}:dispose`); },
    };
}

async function loadModuleRunner(): Promise<ModuleRunnerConstructor> {
    expect(existsSync(moduleRunnerFile)).toBe(true);

    const exports = (await import(
        pathToFileURL(moduleRunnerFile).href
    )) as ModuleRunnerExports;

    expect(typeof exports.ModuleRunner).toBe("function");

    return exports.ModuleRunner as ModuleRunnerConstructor;
}

describe("ModuleRunner main lifecycle", () => {
    test("initializes and starts modules in dependency order", async () => {
        const ModuleRunner = await loadModuleRunner();
        const calls: string[] = [];
        const logging = createModule("logging", calls);
        const inventory = createModule("inventory", calls, [logging.id]);
        const gameplay = createModule("gameplay", calls, [inventory.id]);
        const runner = new ModuleRunner(
            [logging, inventory, gameplay],
            context,
        );

        await runner.initialize();

        expect(calls).toEqual([
            "logging:initialize",
            "inventory:initialize",
            "gameplay:initialize",
        ]);
        expect(runner.getState(logging.id)).toBe("initialized");
        expect(runner.getState(inventory.id)).toBe("initialized");
        expect(runner.getState(gameplay.id)).toBe("initialized");

        await runner.start();

        expect(calls).toEqual([
            "logging:initialize",
            "inventory:initialize",
            "gameplay:initialize",
            "logging:start",
            "inventory:start",
            "gameplay:start",
        ]);
        expect(runner.getState(logging.id)).toBe("started");
        expect(runner.getState(inventory.id)).toBe("started");
        expect(runner.getState(gameplay.id)).toBe("started");
    });

    test("stops and disposes modules in reverse dependency order", async () => {
        const ModuleRunner = await loadModuleRunner();
        const calls: string[] = [];
        const logging = createModule("logging", calls);
        const inventory = createModule("inventory", calls, [logging.id]);
        const gameplay = createModule("gameplay", calls, [inventory.id]);
        const runner = new ModuleRunner(
            [logging, inventory, gameplay],
            context,
        );

        await runner.initialize();
        await runner.start();
        calls.length = 0;

        await runner.stop();

        expect(calls).toEqual([
            "gameplay:stop",
            "inventory:stop",
            "logging:stop",
        ]);
        expect(runner.getState(logging.id)).toBe("stopped");
        expect(runner.getState(inventory.id)).toBe("stopped");
        expect(runner.getState(gameplay.id)).toBe("stopped");

        await runner.dispose();

        expect(calls).toEqual([
            "gameplay:stop",
            "inventory:stop",
            "logging:stop",
            "gameplay:dispose",
            "inventory:dispose",
            "logging:dispose",
        ]);
        expect(runner.getState(logging.id)).toBe("disposed");
        expect(runner.getState(inventory.id)).toBe("disposed");
        expect(runner.getState(gameplay.id)).toBe("disposed");
    });

    test("does not repeat completed lifecycle phases", async () => {
        const ModuleRunner = await loadModuleRunner();
        const calls: string[] = [];
        const module = createModule("inventory", calls);
        const runner = new ModuleRunner([module], context);

        await runner.initialize();
        await runner.initialize();
        await runner.start();
        await runner.start();
        await runner.stop();
        await runner.stop();
        await runner.dispose();
        await runner.dispose();

        expect(calls).toEqual([
            "inventory:initialize",
            "inventory:start",
            "inventory:stop",
            "inventory:dispose",
        ]);
        expect(runner.getState(module.id)).toBe("disposed");
    });
});
