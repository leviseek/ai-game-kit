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
        dispose: async () => { calls.push(`${id}:dispose`); },
    };
}

describe("ModuleRunner initialize rollback", () => {
    test("disposes only initialized modules in reverse order", async () => {
        const ModuleRunner = await loadModuleRunner();
        const calls: string[] = [];
        const logging = createModule("logging", calls);
        const inventory = createModule("inventory", calls, [logging.id]);
        const initializeFailure = new Error("gameplay initialize failed");
        const gameplay: Module = {
            id: "gameplay",
            dependencies: [inventory.id],
            initialize: async () => {
                calls.push("gameplay:initialize");
                throw initializeFailure;
            },
            dispose: async () => { calls.push("gameplay:dispose"); },
        };
        const presentation = createModule(
            "presentation",
            calls,
            [gameplay.id],
        );
        const runner = new ModuleRunner(
            [logging, inventory, gameplay, presentation],
            context,
        );

        await expect(runner.initialize()).rejects.toThrow();

        expect(calls).toEqual([
            "logging:initialize",
            "inventory:initialize",
            "gameplay:initialize",
            "inventory:dispose",
            "logging:dispose",
        ]);
        expect(runner.getState(logging.id)).toBe("disposed");
        expect(runner.getState(inventory.id)).toBe("disposed");
        expect(runner.getState(gameplay.id)).toBe("registered");
        expect(runner.getState(presentation.id)).toBe("registered");
    });
});
