import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";

import type { IApplicationContext, ILogger } from "../../../assets/framework";
import { Application } from "../../../assets/framework/application/Application";
import { MemoryLogger } from "../support/MemoryLogger";

interface CreateApplicationContextFn {
    (logger: ILogger): IApplicationContext;
}

interface ApplicationContextExports {
    readonly createApplicationContext?: CreateApplicationContextFn;
}

const projectRoot = resolve(import.meta.dir, "../../..");
const applicationContextImpl = resolve(projectRoot, "assets/framework/application/ApplicationContext.ts");

async function loadFactory(): Promise<CreateApplicationContextFn> {
    expect(existsSync(applicationContextImpl)).toBe(true);

    const exports = (await import(pathToFileURL(applicationContextImpl).href)) as ApplicationContextExports;

    expect(typeof exports.createApplicationContext).toBe("function");

    return exports.createApplicationContext as CreateApplicationContextFn;
}

function collectKeys(target: object): readonly string[] {
    return [...Object.getOwnPropertyNames(target), ...Object.getOwnPropertyNames(Object.getPrototypeOf(target))];
}

describe("IApplicationContext implementation", () => {
    test("provides a creation API that returns an IApplicationContext", async () => {
        const createApplicationContext = await loadFactory();
        const logger = new MemoryLogger();
        const context = createApplicationContext(logger);

        expect(context).toBeDefined();
        expect(context.logger).toBe(logger);
        expect(typeof context.state).toBe("string");
    });

    test("state starts as created", async () => {
        const createApplicationContext = await loadFactory();
        const context = createApplicationContext(new MemoryLogger());

        expect(context.state).toBe("created");
    });

    test("state reflects the Application lifecycle when wired", async () => {
        const createApplicationContext = await loadFactory();
        const context = createApplicationContext(new MemoryLogger());

        // P1-2 回归：context.state 随 Application 状态转移真实更新（不再恒为
        // "created"）。Symbol 写入器对模块不可见，模块侧仍是只读状态。
        const app = new Application([], context);
        expect(context.state).toBe("created");

        await app.start();
        expect(context.state).toBe("running");

        await app.pause();
        expect(context.state).toBe("paused");

        await app.resume();
        expect(context.state).toBe("running");

        await app.dispose();
        expect(context.state).toBe("disposed");
    });

    test("has no service locator", async () => {
        const createApplicationContext = await loadFactory();
        const context = createApplicationContext(new MemoryLogger());

        const keys = collectKeys(context as object);
        const forbidden = ["get", "resolve", "registry", "container", "provide"];

        for (const key of forbidden) {
            expect(keys).not.toContain(key);
        }
    });

    test("has no application identity", async () => {
        const createApplicationContext = await loadFactory();
        const context = createApplicationContext(new MemoryLogger());

        const keys = collectKeys(context as object);
        const forbidden = ["application", "app", "identity", "owner"];

        for (const key of forbidden) {
            expect(keys).not.toContain(key);
        }
    });

    test("has no reference to the Application instance", async () => {
        const createApplicationContext = await loadFactory();
        const context = createApplicationContext(new MemoryLogger());

        const keys = collectKeys(context as object);

        expect(keys).not.toContain("application");
        expect(keys).not.toContain("app");
    });

    test("has no reference to Game", async () => {
        const createApplicationContext = await loadFactory();
        const context = createApplicationContext(new MemoryLogger());

        const keys = collectKeys(context as object);

        expect(keys).not.toContain("game");
    });

    test("exposes no mutable state", async () => {
        const createApplicationContext = await loadFactory();
        const context = createApplicationContext(new MemoryLogger());

        const stateDescriptor = Object.getOwnPropertyDescriptor(context, "state");

        expect(stateDescriptor?.get).toBeDefined();
        expect(stateDescriptor?.set).toBeUndefined();
        expect(stateDescriptor?.writable).toBeUndefined();
    });

    test("the factory returns the narrow contract without a state mutator", async () => {
        const createApplicationContext = await loadFactory();
        const context = createApplicationContext(new MemoryLogger());

        const keys = collectKeys(context as object);

        expect(keys).not.toContain("_setState");
    });

    test("logger can produce a child scoped by module id", async () => {
        const createApplicationContext = await loadFactory();
        const logger = new MemoryLogger();
        const context = createApplicationContext(logger);

        const child = context.logger.child("inventory");

        expect(child).not.toBe(logger);

        child.info("test");
        expect(logger.records).toEqual([
            expect.objectContaining({
                scope: "inventory",
                message: "test",
            }),
        ]);
    });

    test("the creation API is exported from the framework root entry", () => {
        expect(existsSync(applicationContextImpl)).toBe(true);

        // 组合根与测试经根入口复用同一工厂：createApplicationContext 已纳入
        // 公开白名单（业务侧不再深层导入 application/ApplicationContext）
        const rootSource = resolve(projectRoot, "assets/framework/index.ts");
        const content = readFileSync(rootSource, "utf8");

        expect(content).toMatch(/\bcreateApplicationContext\b/);
    });
});
