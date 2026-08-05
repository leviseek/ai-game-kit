import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { createResourceProvider } from "../../../assets/framework/core/resource/ResourceProvider";
import { createMemoryResourceProvider } from "../../../assets/framework/adapters/memory/MemoryResourceProvider";
import type {
  ResourceHandle,
  ResourceKey,
} from "../../../assets/framework/contracts/resource/Resource";

interface ControlledDeferred {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
}

interface ControlledLoader {
  readonly calls: readonly ResourceKey[];
  readonly pending: readonly ControlledDeferred[];
  readonly loader: (key: ResourceKey) => Promise<unknown>;
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
  const contractsResourceRoot = resolve(
    import.meta.dir,
    "../../../assets/framework/contracts/resource",
  );
  const providerContract = resolve(contractsResourceRoot, "ResourceProvider.ts");

  test("defines IResourceProvider as the unified resource entry", () => {
    expect(existsSync(providerContract)).toBe(true);
    const source = readFileSync(providerContract, "utf8");

    expect(source).toMatch(/interface\s+IResourceProvider\b/);
    expect(source).toMatch(/createScope\s*\(/);
    expect(source).toMatch(/\bload\s*(?:<[^>]*>\s*)?\(/);
    expect(source).toMatch(/\bpreload\s*(?:<[^>]*>\s*)?\(/);
    expect(source).toMatch(/canUnload\s*\(/);
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

    const handle: ResourceHandle = provider.load("common", "config.json");
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
