import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";

import type { IApplicationContext, EnumApplicationState, IModule } from "../../../assets/framework";
import { MemoryLogger } from "../support/MemoryLogger";

interface ApplicationInstance {
    readonly state: EnumApplicationState;
    start(): Promise<void>;
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

describe("Application operation guards", () => {
    test("concurrent start calls return the same promise (single-flight)", async () => {
        const Application = await loadApplication();
        let unblockStart: () => void = () => {};

        const module: IModule = {
            id: "blocking",
            dependencies: [],
            initialize: async () => {},
            start: async () => {
                await new Promise<void>((resolve) => {
                    unblockStart = resolve;
                });
            },
        };

        const app = new Application([module], createContext());

        const first = app.start();
        const second = app.start();

        expect(second).toBe(first);

        await new Promise<void>((r) => setTimeout(r, 0));
        unblockStart();
        await first;
        expect(app.state).toBe("running");
    });

    test("start after running rejects with ApplicationStateError", async () => {
        const Application = await loadApplication();
        const app = new Application([], createContext());

        await app.start();
        expect(app.state).toBe("running");

        const error = await app.start().catch((caught: unknown) => caught);

        expect(isApplicationStateError(error)).toBe(true);
        expect((error as ApplicationStateError).currentState).toBe("running");
    });

    test("start after disposed rejects with ApplicationStateError", async () => {
        const Application = await loadApplication();
        const app = new Application([], createContext());

        await app.start();
        await app.dispose();
        expect(app.state).toBe("disposed");

        const error = await app.start().catch((caught: unknown) => caught);

        expect(isApplicationStateError(error)).toBe(true);
        expect((error as ApplicationStateError).currentState).toBe("disposed");
    });

    test("dispose during start serializes cleanup after start completes", async () => {
        const Application = await loadApplication();
        const calls: string[] = [];
        let unblockStart: () => void = () => {};

        const module: IModule = {
            id: "blocking",
            dependencies: [],
            initialize: async () => {
                calls.push("blocking:initialize");
            },
            start: async () => {
                calls.push("blocking:start");
                await new Promise<void>((resolve) => {
                    unblockStart = resolve;
                });
            },
            stop: async () => {
                calls.push("blocking:stop");
            },
            dispose: async () => {
                calls.push("blocking:dispose");
            },
        };

        const app = new Application([module], createContext());

        const startPromise = app.start();
        const disposePromise = app.dispose();

        await new Promise<void>((r) => setTimeout(r, 0));

        expect(calls).toEqual(["blocking:initialize", "blocking:start"]);

        unblockStart();
        await startPromise;
        await disposePromise;

        expect(calls).toEqual(["blocking:initialize", "blocking:start", "blocking:stop", "blocking:dispose"]);
        expect(app.state).toBe("disposed");
    });

    test("repeated dispose after the first resolves as a no-op", async () => {
        const Application = await loadApplication();
        const app = new Application([], createContext());

        await app.start();
        await app.dispose();
        expect(app.state).toBe("disposed");

        await app.dispose();
        expect(app.state).toBe("disposed");
    });
});
