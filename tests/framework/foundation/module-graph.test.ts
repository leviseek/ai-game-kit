import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";

import type { IModule } from "../../../assets/framework";

interface ModuleGraphInstance {
    readonly orderedModules: readonly IModule[];
}

type ModuleGraphConstructor = new (modules: readonly IModule[]) => ModuleGraphInstance;

interface ModuleGraphExports {
    readonly ModuleGraph?: ModuleGraphConstructor;
}

const projectRoot = resolve(import.meta.dir, "../../..");
const moduleGraphFile = resolve(projectRoot, "assets/framework/application/ModuleGraph.ts");

function createModule(id: string, dependencies: readonly string[] = []): IModule {
    return { id, dependencies };
}

async function loadModuleGraph(): Promise<ModuleGraphConstructor> {
    expect(existsSync(moduleGraphFile)).toBe(true);

    const exports = (await import(pathToFileURL(moduleGraphFile).href)) as ModuleGraphExports;

    expect(typeof exports.ModuleGraph).toBe("function");

    return exports.ModuleGraph as ModuleGraphConstructor;
}

async function orderModules(modules: readonly IModule[]): Promise<readonly IModule[]> {
    const ModuleGraph = await loadModuleGraph();

    return new ModuleGraph(modules).orderedModules;
}

describe("ModuleGraph stable topological order", () => {
    test("accepts an empty module collection", async () => {
        expect(await orderModules([])).toEqual([]);
    });

    test("preserves a single module", async () => {
        const logging = createModule("logging");
        const ordered = await orderModules([logging]);

        expect(ordered).toEqual([logging]);
        expect(ordered[0]).toBe(logging);
    });

    test("orders a dependency chain before its dependents", async () => {
        const core = createModule("core");
        const services = createModule("services", [core.id]);
        const gameplay = createModule("gameplay", [services.id]);

        const ordered = await orderModules([gameplay, services, core]);

        expect(ordered.map(({ id }) => id)).toEqual(["core", "services", "gameplay"]);
    });

    test("orders branching dependencies stably before their dependent", async () => {
        const core = createModule("core");
        const inventory = createModule("inventory", [core.id]);
        const analytics = createModule("analytics", [core.id]);
        const interfaceModule = createModule("interface", [inventory.id, analytics.id]);

        const ordered = await orderModules([interfaceModule, analytics, core, inventory]);

        expect(ordered.map(({ id }) => id)).toEqual(["core", "analytics", "inventory", "interface"]);
    });

    test("preserves registration order for independent modules", async () => {
        const rendering = createModule("rendering");
        const audio = createModule("audio");
        const input = createModule("input");

        const ordered = await orderModules([rendering, audio, input]);

        expect(ordered).toEqual([rendering, audio, input]);
    });
});
