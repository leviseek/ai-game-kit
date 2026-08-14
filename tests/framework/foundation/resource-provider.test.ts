import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { createResourceProvider } from "../../../assets/framework/core/resource/ResourceProvider";
import { createMemoryResourceProvider } from "../../../assets/framework/adapters/memory/MemoryResourceProvider";
import type { IResourceHandle } from "../../../assets/framework/contracts/interfaces/IResourceHandle";
import type { IResourceKey } from "../../../assets/framework/contracts/interfaces/IResourceKey";

interface ControlledDeferred {
    readonly resolve: (value: unknown) => void;
    readonly reject: (reason: unknown) => void;
}

interface ControlledLoader {
    readonly calls: readonly IResourceKey[];
    readonly pending: readonly ControlledDeferred[];
    readonly loader: (key: IResourceKey) => Promise<unknown>;
}

function createControlledLoader(): ControlledLoader {
    const calls: IResourceKey[] = [];
    const pending: ControlledDeferred[] = [];

    const loader = (key: IResourceKey): Promise<unknown> => {
        calls.push(key);
        return new Promise((resolve, reject) => {
            pending.push({ resolve, reject });
        });
    };

    return { calls, pending, loader };
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

describe("IResourceProvider contract shape", () => {
    const contractsResourceRoot = resolve(import.meta.dir, "../../../assets/framework/contracts/interfaces");
    const providerContract = resolve(contractsResourceRoot, "IResourceProvider.ts");

    test("defines IResourceProvider as the unified resource entry", () => {
        expect(existsSync(providerContract)).toBe(true);
        const source = readFileSync(providerContract, "utf8");

        expect(source).toMatch(/interface\s+IResourceProvider\b/);
        expect(source).toMatch(/createScope\s*\(/);
        expect(source).toMatch(/\bload\s*(?:<[^>]*>\s*)?\(/);
        expect(source).toMatch(/\bpreload\s*(?:<[^>]*>\s*)?\(/);
        expect(source).toMatch(/canUnload\s*\(/);
        expect(source).toMatch(/invalidate\s*\(/);
        expect(source).toMatch(/\bdispose\s*\(/);
    });

    test("keeps the resource contract free of engine and core implementation dependencies", () => {
        const sources = collectTypeScriptFiles(contractsResourceRoot)
            .map((file) => readFileSync(file, "utf8"))
            .join("\n");

        expect(sources).not.toMatch(/from\s*["']cc(?:["']|\/)/);
        expect(sources).not.toMatch(/core\/resource/);
    });
});

describe("IResourceProvider as the only resource entry", () => {
    test("load deduplicates concurrent requests for the same resource", async () => {
        const { loader, calls, pending } = createControlledLoader();
        const provider = createResourceProvider({ loader, unloadBundle: () => {} });

        const first = provider.load("common", "a.png");
        const second = provider.load("common", "a.png");

        expect(calls).toHaveLength(1);
        expect(first).not.toBe(second);

        pending[0].resolve({ id: "shared" });
        await first.done;
        await second.done;

        expect(first.state).toBe("ready");
        expect(second.resource).toBe(first.resource);
    });

    test("load returns a handle synchronously carrying identity and loading state", () => {
        const { loader, pending } = createControlledLoader();
        const provider = createResourceProvider({ loader, unloadBundle: () => {} });

        const handle = provider.load("common", "config.json");

        expect(handle.state).toBe("loading");
        expect(handle.key).toEqual({
            kind: "asset",
            bundle: "common",
            path: "config.json",
        });

        pending[0].resolve({});
    });

    test("preload initiates a load with the same handle shape", async () => {
        const { loader, calls, pending } = createControlledLoader();
        const provider = createResourceProvider({ loader, unloadBundle: () => {} });

        const handle = provider.preload("common", "ui/panel.json");

        expect(handle.state).toBe("loading");
        expect(calls).toHaveLength(1);

        pending[0].resolve({ id: "panel" });
        await handle.done;
        expect(handle.state).toBe("ready");
    });

    test("failure preserves the original cause and resource identity", async () => {
        const { loader, pending } = createControlledLoader();
        const provider = createResourceProvider({ loader, unloadBundle: () => {} });
        const original = new Error("disk read failed");

        const handle = provider.load("common", "missing.txt");
        pending[0].reject(original);
        await handle.done;

        expect(handle.state).toBe("failed");

        const failure = handle.error as { cause?: unknown; message: string };
        expect(failure.cause).toBe(original);
        expect(failure.message).toMatch(/missing\.txt/);
        expect(failure.message).toMatch(/common/);
    });

    test("invalidate drops the cached terminal state so reload triggers a fresh underlying load", async () => {
        const { loader, calls, pending } = createControlledLoader();
        const provider = createResourceProvider({ loader, unloadBundle: () => {} });

        const first = provider.load("common", "config.json");
        pending[0].resolve({ id: "cached" });
        await first.done;
        expect(first.resource).toEqual({ id: "cached" });

        provider.invalidate("common", "config.json");

        const second = provider.load("common", "config.json");
        expect(calls).toHaveLength(2);

        pending[1].resolve({ id: "fresh" });
        await second.done;
        expect(second.state).toBe("ready");
        expect(second.resource).toEqual({ id: "fresh" });
    });

    test("invalidate enables retry after a cached failure", async () => {
        const { loader, calls, pending } = createControlledLoader();
        const provider = createResourceProvider({ loader, unloadBundle: () => {} });

        const first = provider.load("common", "flaky.json");
        pending[0].reject(new Error("first attempt failed"));
        await first.done;
        expect(first.state).toBe("failed");

        provider.invalidate("common", "flaky.json");

        const retry = provider.load("common", "flaky.json");
        expect(calls).toHaveLength(2);

        pending[1].resolve({ id: "recovered" });
        await retry.done;
        expect(retry.state).toBe("ready");
        expect(retry.resource).toEqual({ id: "recovered" });
    });

    test("scopes own resources and release without premature unload", async () => {
        const unloaded: string[] = [];
        const { loader, pending } = createControlledLoader();
        const provider = createResourceProvider({
            loader,
            unloadBundle: (bundle: string) => {
                unloaded.push(bundle);
            },
        });

        const page = provider.createScope();
        const app = provider.createScope();
        const handle = provider.load("common", "config.json");
        pending[0].resolve({ id: "cfg" });
        await handle.done;

        page.retain(handle);
        app.retain(handle);

        page.release();
        expect(provider.canUnload("common")).toBe(false);
        expect(unloaded).toEqual([]);

        app.release();
        expect(provider.canUnload("common")).toBe(true);
        expect(unloaded).toEqual(["common"]);
    });

    test("dispose releases every scope created by the provider", async () => {
        const unloaded: string[] = [];
        const { loader, pending } = createControlledLoader();
        const provider = createResourceProvider({
            loader,
            unloadBundle: (bundle: string) => {
                unloaded.push(bundle);
            },
        });

        const first = provider.createScope();
        const second = provider.createScope();
        const commonHandle = provider.load("common", "config.json");
        const audioHandle = provider.load("audio", "bgm.mp3");
        pending[0].resolve({});
        pending[1].resolve({});
        await commonHandle.done;
        await audioHandle.done;

        first.retain(commonHandle);
        second.retain(audioHandle);

        provider.dispose();

        expect(provider.canUnload("common")).toBe(true);
        expect(provider.canUnload("audio")).toBe(true);
        expect([...unloaded].sort()).toEqual(["audio", "common"]);
    });
});

describe("memory resource adapter", () => {
    test("loads resources from the default in-memory table", async () => {
        const provider = createMemoryResourceProvider();

        const handle: IResourceHandle = provider.load("common", "config.json");
        await handle.done;

        expect(handle.state).toBe("ready");
        expect(handle.resource).toEqual({ bundle: "common", path: "config.json" });
    });

    test("supports injecting a custom loader and unload callback", async () => {
        const unloaded: string[] = [];
        const provider = createMemoryResourceProvider({
            loader: async () => ({ id: "mem" }),
            unloadBundle: (bundle: string) => {
                unloaded.push(bundle);
            },
        });

        const scope = provider.createScope();
        const handle = provider.load("common", "a.png");
        await handle.done;

        scope.retain(handle);
        scope.release();

        expect(unloaded).toEqual(["common"]);
    });
});

describe("Creator build-transpilation guard: Set/iterator spreads", () => {
    const projectRoot = resolve(import.meta.dir, "../../..");
    const frameworkRoot = resolve(projectRoot, "assets/framework");

    // Creator 构建会把 `[...set]`/`[...iterable]` 转译为 `[].concat(iterable)`，
    // concat 不展开 Set/迭代器导致运行期失败（LoadCoordinator waiters /
    // IResourceScope 逆序释放 / FairyGuiPageAdapter 页面快照 / MemoryPlatform 监听器，
    // 4.2 冒烟红期实测 `finish is not a function`）。必须使用 Array.from 显式转换。
    // 全库扫描锁定：任何 `[...x]` 后接 `.values()`/`.keys()`/`.entries()` 或展开的
    // 变量名指向 Set/Map 的场景都必须经 Array.from，禁止直接展开运算符。

    const suspiciousPatterns: Array<RegExp> = [/\[\.\.\.[A-Za-z_$][\w$]*\.values\(\)\]/, /\[\.\.\.[A-Za-z_$][\w$]*\.keys\(\)\]/, /\[\.\.\.[A-Za-z_$][\w$]*\.entries\(\)\]/];

    const knownSetLikeNames = ["waiters", "pages", "visibilityListeners"];

    function collectTypeScriptFiles(directory: string): string[] {
        return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
            const path = resolve(directory, entry.name);
            if (entry.isDirectory()) {
                return collectTypeScriptFiles(path);
            }
            return entry.isFile() && path.endsWith(".ts") ? [path] : [];
        });
    }

    test("LoadCoordinator snapshots waiters with Array.from", () => {
        const source = readFileSync(resolve(frameworkRoot, "core/resource/LoadCoordinator.ts"), "utf8");
        expect(source).toMatch(/Array\.from\(entry\.waiters\)/);
        expect(source).not.toMatch(/\[\.\.\.entry\.waiters\]/);
    });

    test("IResourceScope iterates held values with Array.from", () => {
        const source = readFileSync(resolve(frameworkRoot, "core/resource/ResourceScope.ts"), "utf8");
        expect(source).toMatch(/Array\.from\(held\.values\(\)\)/);
        expect(source).not.toMatch(/\[\.\.\.held\.values\(\)\]/);
    });

    test("FairyGuiPageAdapter snapshots pages with Array.from", () => {
        const source = readFileSync(resolve(frameworkRoot, "adapters/cocos/ui/FairyGuiPageAdapter.ts"), "utf8");
        expect(source).toMatch(/Array\.from\(pages\)/);
        expect(source).not.toMatch(/\[\.\.\.pages\]/);
    });

    test("MemoryPlatform iterates visibility listeners with Array.from", () => {
        const source = readFileSync(resolve(frameworkRoot, "adapters/memory/MemoryPlatform.ts"), "utf8");
        expect(source).toMatch(/Array\.from\(this\.visibilityListeners\)/);
        expect(source).not.toMatch(/\[\.\.\.this\.visibilityListeners\]/);
    });

    test("no framework file spreads a Set/Map iterator with the spread operator", () => {
        const offenders: Array<{ file: string; line: string }> = [];

        for (const file of collectTypeScriptFiles(frameworkRoot)) {
            const lines = readFileSync(file, "utf8").split("\n");
            for (let index = 0; index < lines.length; index += 1) {
                const line = lines[index];
                if (suspiciousPatterns.some((pattern) => pattern.test(line))) {
                    offenders.push({ file, line: line.trim() });
                }
                // 展开的变量名若命中已知 Set/Map 名，视为危险展开
                const expanded = line.match(/\[\.\.\.([A-Za-z_$][\w$]*)\]/);
                if (expanded !== null && knownSetLikeNames.includes(expanded[1])) {
                    offenders.push({ file, line: line.trim() });
                }
            }
        }

        expect(offenders).toEqual([]);
    });
});
