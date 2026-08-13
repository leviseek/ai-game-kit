import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import type { ApplicationContext, Module } from "../../../assets/framework";

const projectRoot = resolve(import.meta.dir, "../../..");
const frameworkRoot = resolve(projectRoot, "assets/framework");
const frameworkEntry = resolve(frameworkRoot, "index.ts");
const moduleContractRoot = resolve(frameworkRoot, "contracts/module");
const moduleContractFile = resolve(moduleContractRoot, "Module.ts");
const applicationContractRoot = resolve(frameworkRoot, "contracts/application");
const runtimeImportScanner = new Bun.Transpiler({ loader: "ts" });

function isWithin(path: string, directory: string): boolean {
    const pathFromDirectory = relative(directory, path);
    return pathFromDirectory === "" || (!pathFromDirectory.startsWith("..") && !isAbsolute(pathFromDirectory));
}

function collectTypeScriptFiles(directory: string): readonly string[] {
    if (!existsSync(directory)) {
        return [];
    }

    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = resolve(directory, entry.name);

        if (entry.isDirectory()) {
            return collectTypeScriptFiles(path);
        }

        return entry.isFile() && path.endsWith(".ts") ? [path] : [];
    });
}

function extractTypeOnlyImports(source: string): readonly string[] {
    const specifiers: string[] = [];
    const pattern = /\bimport\s+type\b[\s\S]*?\bfrom\s*["']([^"']+)["']/g;

    for (const match of source.matchAll(pattern)) {
        const specifier = match[1];

        if (specifier !== undefined) {
            specifiers.push(specifier);
        }
    }

    return specifiers;
}

function resolveRelativeImport(importer: string, specifier: string): string | undefined {
    return specifier.startsWith(".") ? resolve(dirname(importer), specifier) : undefined;
}

function readModuleContractSources(): readonly {
    readonly file: string;
    readonly source: string;
}[] {
    return collectTypeScriptFiles(moduleContractRoot).map((file) => ({
        file,
        source: readFileSync(file, "utf8"),
    }));
}

const metadataOnlyModule: Module = {
    id: "metadata-only",
    dependencies: ["logging"],
};

function createSynchronousModule(calls: string[]): Module {
    return {
        id: "synchronous",
        dependencies: [],
        initialize: () => {
            calls.push("initialize");
        },
        start: () => {
            calls.push("start");
        },
        pause: () => {
            calls.push("pause");
        },
        resume: () => {
            calls.push("resume");
        },
        stop: () => {
            calls.push("stop");
        },
        dispose: () => {
            calls.push("dispose");
        },
    };
}

function createAsynchronousModule(calls: string[]): Module {
    return {
        id: "asynchronous",
        dependencies: [metadataOnlyModule.id],
        initialize: async () => {
            calls.push("initialize");
        },
        start: async () => {
            calls.push("start");
        },
        pause: async () => {
            calls.push("pause");
        },
        resume: async () => {
            calls.push("resume");
        },
        stop: async () => {
            calls.push("stop");
        },
        dispose: async () => {
            calls.push("dispose");
        },
    };
}

describe("Module contract", () => {
    test("is exposed as a composition contract instead of a base class or singleton", () => {
        expect(existsSync(moduleContractFile)).toBe(true);

        if (!existsSync(moduleContractFile)) {
            return;
        }

        const moduleSource = readFileSync(moduleContractFile, "utf8");
        const allModuleSources = readModuleContractSources()
            .map(({ source }) => source)
            .join("\n");
        const frameworkSource = readFileSync(frameworkEntry, "utf8");

        expect(moduleSource).toMatch(/\bexport\s+interface\s+Module\b/);
        expect(frameworkSource).toMatch(/export\s+type\s*\{[\s\S]*?\bModule\b[\s\S]*?\}\s*from\s*["']\.\/contracts\/module\/Module["']/);
        expect(allModuleSources).not.toMatch(/\bextends\s+(?:BaseModule|Component)\b/);
        expect(allModuleSources).not.toMatch(/\b(?:globalThis|registerSingleton|registerModule)\b/);
        expect(allModuleSources).not.toMatch(/\bstatic\s+(?:readonly\s+)?(?:instance|shared)\b/);
    });

    test("uses stable string ids as module and dependency identity", () => {
        expect(metadataOnlyModule.id).toBe("metadata-only");
        expect(metadataOnlyModule.dependencies).toEqual(["logging"]);
        expect(typeof metadataOnlyModule.dependencies[0]).toBe("string");
    });

    test("erases contracts/module completely from runtime output", () => {
        const runtimeFiles = readModuleContractSources().flatMap(({ file, source }) =>
            runtimeImportScanner.transformSync(source).trim().length === 0 ? [] : [relative(moduleContractRoot, file).replaceAll("\\", "/")],
        );

        expect(runtimeFiles).toEqual([]);
    });

    test("allows every lifecycle hook to be omitted", () => {
        expect(metadataOnlyModule.initialize).toBeUndefined();
        expect(metadataOnlyModule.start).toBeUndefined();
        expect(metadataOnlyModule.pause).toBeUndefined();
        expect(metadataOnlyModule.resume).toBeUndefined();
        expect(metadataOnlyModule.stop).toBeUndefined();
        expect(metadataOnlyModule.dispose).toBeUndefined();
    });

    test("allows synchronous lifecycle hooks", () => {
        const calls: string[] = [];
        const module = createSynchronousModule(calls);
        const context = {} as ApplicationContext;

        expect(module.initialize?.(context)).toBeUndefined();
        expect(module.start?.(context)).toBeUndefined();
        expect(module.pause?.(context)).toBeUndefined();
        expect(module.resume?.(context)).toBeUndefined();
        expect(module.stop?.(context)).toBeUndefined();
        expect(module.dispose?.(context)).toBeUndefined();
        expect(calls).toEqual(["initialize", "start", "pause", "resume", "stop", "dispose"]);
    });

    test("allows asynchronous lifecycle hooks", async () => {
        const calls: string[] = [];
        const module = createAsynchronousModule(calls);
        const context = {} as ApplicationContext;

        await module.initialize?.(context);
        await module.start?.(context);
        await module.pause?.(context);
        await module.resume?.(context);
        await module.stop?.(context);
        await module.dispose?.(context);

        expect(calls).toEqual(["initialize", "start", "pause", "resume", "stop", "dispose"]);
    });

    test("imports ApplicationContext only as a type from contracts/application", () => {
        if (!existsSync(moduleContractFile)) {
            return;
        }

        const source = readFileSync(moduleContractFile, "utf8");
        const typeOnlyTargets = extractTypeOnlyImports(source)
            .map((specifier) => resolveRelativeImport(moduleContractFile, specifier))
            .filter((target): target is string => target !== undefined);
        const runtimeTargets = runtimeImportScanner
            .scan(source)
            .imports.map(({ path }) => resolveRelativeImport(moduleContractFile, path))
            .filter((target): target is string => target !== undefined);

        expect(typeOnlyTargets.some((target) => isWithin(target, applicationContractRoot))).toBe(true);
        expect(runtimeTargets.some((target) => isWithin(target, applicationContractRoot))).toBe(false);
        expect(source).not.toMatch(/\bfrom\s*["']\.\.\/\.\.\/application(?:\/|["'])/);
    });
});
