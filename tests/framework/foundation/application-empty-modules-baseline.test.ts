import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";

import type { ApplicationContext, ApplicationState, Module } from "../../../assets/framework";
import { MemoryLogger } from "../support/MemoryLogger";

interface ApplicationInstance {
    readonly state: ApplicationState;
    start(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    dispose(): Promise<void>;
}

type ApplicationConstructor = new (modules: readonly Module[], context: ApplicationContext) => ApplicationInstance;

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

function createContext(): ApplicationContext {
    return { logger: new MemoryLogger(), state: "created" };
}

describe("AppRoot default startup baseline", () => {
    test("empty module list runs full lifecycle start → pause → resume → dispose", async () => {
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

    test("start throws from non-created state even with empty modules", async () => {
        const Application = await loadApplication();
        const app = new Application([], createContext());

        await app.start();
        await expect(app.start()).rejects.toThrow();
    });

    test("dispose from created state is valid even with empty modules", async () => {
        const Application = await loadApplication();
        const app = new Application([], createContext());

        await app.dispose();
        expect(app.state).toBe("disposed");
    });
});
