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
    pause(): Promise<void>;
    resume(): Promise<void>;
    getState(moduleId: string): ModuleRuntimeState | undefined;
}

type ModuleRunnerConstructor = new (
    modules: readonly Module[],
    context: ApplicationContext,
) => ModuleRunnerInstance;

interface ModuleRunnerExports {
    readonly ModuleRunner: ModuleRunnerConstructor;
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
): Module {
    return {
        id,
        dependencies,
        initialize: async () => { calls.push(`${id}:initialize`); },
        start: async () => { calls.push(`${id}:start`); },
        pause: async () => { calls.push(`${id}:pause`); },
        resume: async () => { calls.push(`${id}:resume`); },
    };
}

describe("ModuleRunner pause and resume smoke behavior", () => {
    test("pauses started modules in reverse dependency order", async () => {
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

        await runner.pause();

        expect(calls).toEqual([
            "gameplay:pause",
            "inventory:pause",
            "logging:pause",
        ]);
        expect(runner.getState(logging.id)).toBe("paused");
        expect(runner.getState(inventory.id)).toBe("paused");
        expect(runner.getState(gameplay.id)).toBe("paused");
    });

    test("resumes paused modules in dependency order", async () => {
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
        await runner.pause();
        calls.length = 0;

        await runner.resume();

        expect(calls).toEqual([
            "logging:resume",
            "inventory:resume",
            "gameplay:resume",
        ]);
        expect(runner.getState(logging.id)).toBe("started");
        expect(runner.getState(inventory.id)).toBe("started");
        expect(runner.getState(gameplay.id)).toBe("started");
    });

    test("supports modules that omit pause and resume hooks", async () => {
        const ModuleRunner = await loadModuleRunner();
        const calls: string[] = [];
        const logging = createModule("logging", calls);
        const headless: Module = {
            id: "headless",
            dependencies: [logging.id],
            initialize: async () => { calls.push("headless:initialize"); },
            start: async () => { calls.push("headless:start"); },
        };
        const gameplay = createModule("gameplay", calls, [headless.id]);
        const runner = new ModuleRunner(
            [logging, headless, gameplay],
            context,
        );

        await runner.initialize();
        await runner.start();
        calls.length = 0;

        await runner.pause();
        await runner.resume();

        expect(calls).toEqual([
            "gameplay:pause",
            "logging:pause",
            "logging:resume",
            "gameplay:resume",
        ]);
        expect(runner.getState(logging.id)).toBe("started");
        expect(runner.getState(headless.id)).toBe("started");
        expect(runner.getState(gameplay.id)).toBe("started");
    });
});
