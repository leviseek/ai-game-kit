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

function createLifecycleModule(id: string, calls: string[], states: EnumApplicationState[], app: () => ApplicationInstance, dependencies: readonly string[] = []): IModule {
    const observe = (phase: string): void => {
        states.push(app().state);
        calls.push(`${id}:${phase}`);
    };

    return {
        id,
        dependencies,
        initialize: async () => {
            observe("initialize");
        },
        start: async () => {
            observe("start");
        },
        pause: async () => {
            observe("pause");
        },
        resume: async () => {
            observe("resume");
        },
        stop: async () => {
            observe("stop");
        },
        dispose: async () => {
            observe("dispose");
        },
    };
}

describe("Application lifecycle", () => {
    test("starts in the created state", async () => {
        const Application = await loadApplication();
        const app = new Application([], createContext());

        expect(app.state).toBe("created");
    });

    test("transitions through the full lifecycle in order", async () => {
        const Application = await loadApplication();
        const calls: string[] = [];
        const states: EnumApplicationState[] = [];

        const app = new Application([createLifecycleModule("inventory", calls, states, () => app)], createContext());

        expect(app.state).toBe("created");

        await app.start();
        expect(app.state).toBe("running");

        await app.pause();
        expect(app.state).toBe("paused");

        await app.resume();
        expect(app.state).toBe("running");

        await app.dispose();
        expect(app.state).toBe("disposed");

        expect(calls).toEqual(["inventory:initialize", "inventory:start", "inventory:pause", "inventory:resume", "inventory:stop", "inventory:dispose"]);
        expect(states).toEqual(["initializing", "initializing", "running", "paused", "stopping", "stopping"]);
    });

    test("runs the complete lifecycle with no modules", async () => {
        const Application = await loadApplication();
        const app = new Application([], createContext());

        expect(app.state).toBe("created");

        await app.start();
        expect(app.state).toBe("running");

        await app.pause();
        expect(app.state).toBe("paused");

        await app.resume();
        expect(app.state).toBe("running");

        await app.dispose();
        expect(app.state).toBe("disposed");
    });

    test("passes the provided context to module hooks without mutating it", async () => {
        const Application = await loadApplication();
        const logger = new MemoryLogger();
        const context: IApplicationContext = { logger, state: "created" };
        let receivedContext: IApplicationContext | undefined;
        const module: IModule = {
            id: "probe",
            dependencies: [],
            initialize: async (ctx) => {
                receivedContext = ctx;
            },
        };

        const app = new Application([module], context);

        await app.start();
        expect(receivedContext).toBe(context);
        expect(context.state).toBe("created");

        await app.dispose();
        expect(context.state).toBe("created");
    });
});
