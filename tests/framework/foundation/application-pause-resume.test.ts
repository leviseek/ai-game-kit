import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";

import type { IApplicationContext, EnumApplicationState, IModule } from "../../../assets/framework";
import { MemoryLogger } from "../support/MemoryLogger";

interface ApplicationInstance {
    readonly state: EnumApplicationState;
    start(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    dispose(): Promise<void>;
}

type ApplicationConstructor = new (modules: readonly IModule[], context: IApplicationContext) => ApplicationInstance;

interface FrameworkExports {
    readonly Application?: ApplicationConstructor;
}

type ApplicationStateError = Error & {
    readonly currentState: EnumApplicationState;
};

function isApplicationStateError(error: unknown): error is ApplicationStateError {
    return error instanceof Error && error.name === "ApplicationStateError" && "currentState" in (error as Record<string, unknown>);
}

const projectRoot = resolve(import.meta.dir, "../../..");
const frameworkEntry = resolve(projectRoot, "assets/framework/index.ts");

async function loadApplication(): Promise<ApplicationConstructor> {
    const exports = (await import(pathToFileURL(frameworkEntry).href)) as FrameworkExports;

    expect(typeof exports.Application).toBe("function");

    return exports.Application as ApplicationConstructor;
}

function createContext(): IApplicationContext {
    return { logger: new MemoryLogger(), state: "created" };
}

function createRecorderModule(id: string, calls: string[], dependencies: readonly string[] = []): IModule {
    return {
        id,
        dependencies,
        initialize: async () => {
            calls.push(`${id}:initialize`);
        },
        start: async () => {
            calls.push(`${id}:start`);
        },
        pause: async () => {
            calls.push(`${id}:pause`);
        },
        resume: async () => {
            calls.push(`${id}:resume`);
        },
        stop: async () => {
            calls.push(`${id}:stop`);
        },
        dispose: async () => {
            calls.push(`${id}:dispose`);
        },
    };
}

describe("Application pause and resume", () => {
    test("transitions from running to paused and back", async () => {
        const Application = await loadApplication();
        const app = new Application([], createContext());

        await app.start();
        expect(app.state).toBe("running");

        await app.pause();
        expect(app.state).toBe("paused");

        await app.resume();
        expect(app.state).toBe("running");

        await app.dispose();
        expect(app.state).toBe("disposed");
    });

    test("repeated pause from paused resolves as a no-op", async () => {
        const Application = await loadApplication();
        const app = new Application([], createContext());

        await app.start();
        await app.pause();
        expect(app.state).toBe("paused");

        await app.pause();
        expect(app.state).toBe("paused");
    });

    test("repeated resume from running resolves as a no-op", async () => {
        const Application = await loadApplication();
        const app = new Application([], createContext());

        await app.start();
        expect(app.state).toBe("running");

        await app.resume();
        expect(app.state).toBe("running");
    });

    test("pause from created rejects with ApplicationStateError", async () => {
        const Application = await loadApplication();
        const app = new Application([], createContext());

        const error = await app.pause().catch((caught: unknown) => caught);

        expect(isApplicationStateError(error)).toBe(true);
        expect((error as ApplicationStateError).currentState).toBe("created");
    });

    test("resume from created rejects with ApplicationStateError", async () => {
        const Application = await loadApplication();
        const app = new Application([], createContext());

        const error = await app.resume().catch((caught: unknown) => caught);

        expect(isApplicationStateError(error)).toBe(true);
        expect((error as ApplicationStateError).currentState).toBe("created");
    });

    test("pause from disposed rejects with ApplicationStateError", async () => {
        const Application = await loadApplication();
        const app = new Application([], createContext());

        await app.start();
        await app.dispose();
        expect(app.state).toBe("disposed");

        const error = await app.pause().catch((caught: unknown) => caught);

        expect(isApplicationStateError(error)).toBe(true);
        expect((error as ApplicationStateError).currentState).toBe("disposed");
    });

    test("resume from disposed rejects with ApplicationStateError", async () => {
        const Application = await loadApplication();
        const app = new Application([], createContext());

        await app.start();
        await app.dispose();
        expect(app.state).toBe("disposed");

        const error = await app.resume().catch((caught: unknown) => caught);

        expect(isApplicationStateError(error)).toBe(true);
        expect((error as ApplicationStateError).currentState).toBe("disposed");
    });

    test("works with modules that omit pause and resume hooks", async () => {
        const Application = await loadApplication();
        const calls: string[] = [];
        const module: IModule = {
            id: "partial",
            dependencies: [],
            initialize: async () => {
                calls.push("partial:initialize");
            },
            start: async () => {
                calls.push("partial:start");
            },
            stop: async () => {
                calls.push("partial:stop");
            },
            dispose: async () => {
                calls.push("partial:dispose");
            },
        };

        const app = new Application([module], createContext());

        await app.start();
        await app.pause();
        await app.resume();
        await app.dispose();

        expect(calls).toEqual(["partial:initialize", "partial:start", "partial:stop", "partial:dispose"]);
    });

    test("invokes pause hooks in reverse order and resume in forward order", async () => {
        const Application = await loadApplication();
        const calls: string[] = [];

        const logging = createRecorderModule("logging", calls);
        const inventory = createRecorderModule("inventory", calls, [logging.id]);
        const gameplay = createRecorderModule("gameplay", calls, [inventory.id]);

        const app = new Application([logging, inventory, gameplay], createContext());

        await app.start();
        calls.length = 0;

        await app.pause();

        expect(calls).toEqual(["gameplay:pause", "inventory:pause", "logging:pause"]);

        calls.length = 0;

        await app.resume();

        expect(calls).toEqual(["logging:resume", "inventory:resume", "gameplay:resume"]);

        await app.dispose();
    });
});
