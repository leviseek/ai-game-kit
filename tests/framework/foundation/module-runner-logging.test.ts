import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";

import { ModuleLifecycleError, type ApplicationContext, type Module } from "../../../assets/framework";
import { MemoryLogger } from "../support/MemoryLogger";

interface ModuleRunnerInstance {
    initialize(): Promise<void>;
    start(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    stop(): Promise<void>;
    dispose(): Promise<void>;
}

type ModuleRunnerConstructor = new (modules: readonly Module[], context: ApplicationContext) => ModuleRunnerInstance;

interface ModuleRunnerExports {
    readonly ModuleRunner: ModuleRunnerConstructor;
}

type ErrorWithCause = Error & { readonly cause?: unknown };

const projectRoot = resolve(import.meta.dir, "../../..");
const moduleRunnerFile = resolve(projectRoot, "assets/framework/application/ModuleRunner.ts");

async function loadModuleRunner(): Promise<ModuleRunnerConstructor> {
    const exports = (await import(pathToFileURL(moduleRunnerFile).href)) as ModuleRunnerExports;

    return exports.ModuleRunner;
}

describe("ModuleRunner lifecycle logging", () => {
    test("records every successful module phase without application identity", async () => {
        const ModuleRunner = await loadModuleRunner();
        const logger = new MemoryLogger();
        const context: ApplicationContext = {
            logger,
            state: "created",
        };
        const module: Module = {
            id: "inventory",
            dependencies: [],
            initialize: async () => {},
            start: async () => {},
            pause: async () => {},
            resume: async () => {},
            stop: async () => {},
            dispose: async () => {},
        };
        const runner = new ModuleRunner([module], context);

        await runner.initialize();
        await runner.start();
        await runner.pause();
        await runner.resume();
        await runner.stop();
        await runner.dispose();

        expect(
            logger.records.map((record) => ({
                level: record.level,
                context: record.context,
            })),
        ).toEqual([
            {
                level: "info",
                context: {
                    moduleId: "inventory",
                    phase: "initialize",
                    result: "success",
                },
            },
            {
                level: "info",
                context: {
                    moduleId: "inventory",
                    phase: "start",
                    result: "success",
                },
            },
            {
                level: "info",
                context: {
                    moduleId: "inventory",
                    phase: "pause",
                    result: "success",
                },
            },
            {
                level: "info",
                context: {
                    moduleId: "inventory",
                    phase: "resume",
                    result: "success",
                },
            },
            {
                level: "info",
                context: {
                    moduleId: "inventory",
                    phase: "stop",
                    result: "success",
                },
            },
            {
                level: "info",
                context: {
                    moduleId: "inventory",
                    phase: "dispose",
                    result: "success",
                },
            },
        ]);
    });

    test("records a failed module phase at error level with its cause", async () => {
        const ModuleRunner = await loadModuleRunner();
        const logger = new MemoryLogger();
        const context: ApplicationContext = {
            logger,
            state: "created",
        };
        const startFailure = new Error("inventory start failed");
        const module: Module = {
            id: "inventory",
            dependencies: [],
            initialize: async () => {},
            start: async () => {
                throw startFailure;
            },
        };
        const runner = new ModuleRunner([module], context);

        await runner.initialize();
        await expect(runner.start()).rejects.toThrow();

        const failureRecord = logger.records.find((record) => record.context.phase === "start");

        expect(failureRecord?.level).toBe("error");
        expect(failureRecord?.context).toEqual({
            moduleId: "inventory",
            phase: "start",
            result: "failure",
        });
        expect(failureRecord?.error).toBeInstanceOf(ModuleLifecycleError);
        expect((failureRecord?.error as ErrorWithCause).cause).toBe(startFailure);
    });
});
