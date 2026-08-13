import { describe, expect, test } from "bun:test";

import { createResourceProvider } from "../../../assets/framework/core/resource/ResourceProvider";
import type { ResourceKey } from "../../../assets/framework/contracts/resource/Resource";

interface ControlledDeferred {
    readonly resolve: (value: unknown) => void;
    readonly reject: (reason: unknown) => void;
}

interface ControlledLoader {
    readonly calls: readonly ResourceKey[];
    readonly pending: readonly ControlledDeferred[];
    readonly loader: (key: ResourceKey) => Promise<unknown>;
}

function packageKey(path: string, bundle = "ui"): ResourceKey {
    return { kind: "fairygui-package", bundle, path };
}

function createControlledLoader(): ControlledLoader {
    const calls: ResourceKey[] = [];
    const pending: ControlledDeferred[] = [];

    const loader = (key: ResourceKey): Promise<unknown> => {
        calls.push(key);
        return new Promise((resolve, reject) => {
            pending.push({ resolve, reject });
        });
    };

    return { calls, pending, loader };
}

describe("FairyGUI package loading contract", () => {
    test("loadPackage requests the resource with a fairygui-package identity", async () => {
        const { loader, calls, pending } = createControlledLoader();
        const provider = createResourceProvider({ loader, unloadBundle: () => {} });

        const handle = provider.loadPackage("ui", "main");

        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual(packageKey("main", "ui"));
        expect(handle.key).toEqual(packageKey("main", "ui"));

        pending[0].resolve({ id: "package" });
        await handle.done;

        expect(handle.state).toBe("ready");
        expect(handle.resource).toEqual({ id: "package" });
    });

    test("concurrent package requests share a single underlying load", async () => {
        const { loader, calls, pending } = createControlledLoader();
        const provider = createResourceProvider({ loader, unloadBundle: () => {} });

        const first = provider.loadPackage("ui", "main");
        const second = provider.loadPackage("ui", "main");

        expect(calls).toHaveLength(1);
        expect(first).not.toBe(second);

        const value = { id: "shared-package" };
        pending[0].resolve(value);
        await first.done;
        await second.done;

        expect(first.state).toBe("ready");
        expect(second.state).toBe("ready");
        expect(first.resource).toBe(value);
        expect(second.resource).toBe(value);
    });

    test("a failed package load keeps the original cause and resource identity", async () => {
        const { loader, pending } = createControlledLoader();
        const provider = createResourceProvider({ loader, unloadBundle: () => {} });
        const original = new Error("package corrupt");

        const handle = provider.loadPackage("ui", "missing");
        pending[0].reject(original);
        await handle.done;

        expect(handle.state).toBe("failed");

        const failure = handle.error as Error & { readonly cause?: unknown };
        expect(failure).toBeInstanceOf(Error);
        expect(failure.message).toMatch(/ui:missing/);
        expect(failure.message).toMatch(/fairygui-package/);
        expect(failure.cause).toBe(original);
    });

    test("a failed package load is isolated from other waiters", async () => {
        const { loader, pending } = createControlledLoader();
        const provider = createResourceProvider({ loader, unloadBundle: () => {} });
        const original = new Error("first attempt failed");

        const first = provider.loadPackage("ui", "missing");
        pending[0].reject(original);
        await first.done;

        const late = provider.loadPackage("ui", "missing");

        expect(late.state).toBe("failed");
        expect((late.error as Error & { readonly cause?: unknown }).cause).toBe(original);
    });

    test("package handles participate in scope release without premature unload", async () => {
        const unloaded: string[] = [];
        const { loader, pending } = createControlledLoader();
        const provider = createResourceProvider({
            loader,
            unloadBundle: (bundle: string) => {
                unloaded.push(bundle);
            },
        });

        const scope = provider.createScope();
        const handle = provider.loadPackage("ui", "main");
        pending[0].resolve({ id: "package" });
        await handle.done;

        scope.retain(handle);
        expect(provider.canUnload("ui")).toBe(false);

        scope.release();
        expect(provider.canUnload("ui")).toBe(true);
        expect(unloaded).toEqual(["ui"]);
    });

    test("package and asset holdings release in reverse retain order", async () => {
        const unloaded: string[] = [];
        const { loader, pending } = createControlledLoader();
        const provider = createResourceProvider({
            loader,
            unloadBundle: (bundle: string) => {
                unloaded.push(bundle);
            },
        });

        const scope = provider.createScope();
        const audio = provider.load("audio", "bgm.mp3");
        const packageHandle = provider.loadPackage("ui", "main");
        pending[0].resolve({});
        pending[1].resolve({ id: "package" });
        await audio.done;
        await packageHandle.done;

        scope.retain(audio);
        scope.retain(packageHandle);

        scope.release();

        // 释放按持有逆序：先 package(ui) 后 asset(audio)
        expect(unloaded).toEqual(["ui", "audio"]);
    });

    test("a package still referenced by another scope is preserved", async () => {
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
        const handle = provider.loadPackage("ui", "main");
        pending[0].resolve({ id: "package" });
        await handle.done;

        first.retain(handle);
        second.retain(handle);

        first.release();
        expect(provider.canUnload("ui")).toBe(false);
        expect(unloaded).toEqual([]);

        second.release();
        expect(provider.canUnload("ui")).toBe(true);
        expect(unloaded).toEqual(["ui"]);
    });

    test("invalidatePackage clears a failed package entry so it can be reloaded", async () => {
        const { loader, calls, pending } = createControlledLoader();
        const provider = createResourceProvider({ loader, unloadBundle: () => {} });
        const original = new Error("first attempt failed");

        const first = provider.loadPackage("ui", "missing");
        pending[0].reject(original);
        await first.done;
        expect(first.state).toBe("failed");
        expect(calls).toHaveLength(1);

        // 失效后再次加载触发新的底层加载
        provider.invalidatePackage("ui", "missing");
        const retried = provider.loadPackage("ui", "missing");
        expect(calls).toHaveLength(2);

        pending[1].resolve({ id: "package-reloaded" });
        await retried.done;

        expect(retried.state).toBe("ready");
        expect(retried.resource).toEqual({ id: "package-reloaded" });
    });

    test("invalidatePackage on an unknown package key is a no-op", async () => {
        const { loader, calls } = createControlledLoader();
        const provider = createResourceProvider({ loader, unloadBundle: () => {} });

        provider.invalidatePackage("ui", "never-loaded");

        const handle = provider.loadPackage("ui", "never-loaded");
        expect(calls).toHaveLength(1);
        expect(handle.state).toBe("loading");
    });
});
