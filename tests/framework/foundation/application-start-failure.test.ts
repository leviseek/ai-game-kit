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

type ErrorWithCause = Error & { readonly cause?: unknown };

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

function createModule(id: string, calls: string[], dependencies: readonly string[] = []): IModule {
    return {
        id,
        dependencies,
        initialize: async () => {
            calls.push(`${id}:initialize`);
        },
        start: async () => {
            calls.push(`${id}:start`);
        },
        stop: async () => {
            calls.push(`${id}:stop`);
        },
        dispose: async () => {
            calls.push(`${id}:dispose`);
        },
    };
}

function collectMessages(error: unknown, limit = 8): string[] {
    const messages: string[] = [];
    const seen = new Set<unknown>();
    let current: unknown = error;

    while (current instanceof Error && !seen.has(current)) {
        seen.add(current);
        messages.push(current.message);
        current = (current as ErrorWithCause).cause;

        if (messages.length >= limit) {
            break;
        }
    }

    return messages;
}

describe("Application start failure", () => {
    test("rejects on duplicate module ids without running any hooks", async () => {
        const Application = await loadApplication();
        const calls: string[] = [];
        const first = createModule("duplicate", calls);
        const second = createModule("duplicate", calls);
        const app = new Application([first, second], createContext());

        expect(app.state).toBe("created");

        await expect(app.start()).rejects.toThrow();

        expect(app.state).toBe("disposed");
        expect(calls).toEqual([]);
    });

    test("rejects on a missing dependency without running any hooks", async () => {
        const Application = await loadApplication();
        const calls: string[] = [];
        const module = createModule("inventory", calls, ["missing"]);
        const app = new Application([module], createContext());

        expect(app.state).toBe("created");

        await expect(app.start()).rejects.toThrow();

        expect(app.state).toBe("disposed");
        expect(calls).toEqual([]);
    });

    test("rejects when a module initialize fails and keeps the original error traceable", async () => {
        const Application = await loadApplication();
        const calls: string[] = [];
        const stable = createModule("stable", calls);
        const initializeFailure = new Error("inventory initialize failed");
        const failing: IModule = {
            id: "inventory",
            dependencies: [stable.id],
            initialize: async () => {
                calls.push("inventory:initialize");
                throw initializeFailure;
            },
            dispose: async () => {
                calls.push("inventory:dispose");
            },
        };
        const app = new Application([stable, failing], createContext());

        const error = await app.start().catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(Error);
        expect(collectMessages(error)).toContain(initializeFailure.message);
        expect(app.state).toBe("disposed");
        expect(calls).toEqual(["stable:initialize", "inventory:initialize", "stable:dispose"]);
    });

    test("rejects when a module start fails without hiding the start error", async () => {
        const Application = await loadApplication();
        const calls: string[] = [];
        const stable = createModule("stable", calls);
        const startFailure = new Error("gameplay start failed");
        const failing: IModule = {
            id: "gameplay",
            dependencies: [stable.id],
            initialize: async () => {
                calls.push("gameplay:initialize");
            },
            start: async () => {
                calls.push("gameplay:start");
                throw startFailure;
            },
            stop: async () => {
                calls.push("gameplay:stop");
            },
            dispose: async () => {
                calls.push("gameplay:dispose");
            },
        };
        const app = new Application([stable, failing], createContext());

        const error = await app.start().catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(Error);
        expect(collectMessages(error)).toContain(startFailure.message);
        expect(app.state).toBe("disposed");
        expect(calls).toEqual(["stable:initialize", "gameplay:initialize", "stable:start", "gameplay:start", "stable:stop", "gameplay:dispose", "stable:dispose"]);
    });
});
