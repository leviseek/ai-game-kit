import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";

import type { Module } from "../../../assets/framework";

type ModuleGraphConstructor = new (modules: readonly Module[]) => object;

interface ModuleGraphExports {
  readonly ModuleGraph?: ModuleGraphConstructor;
}

const projectRoot = resolve(import.meta.dir, "../../..");
const moduleGraphFile = resolve(
  projectRoot,
  "assets/framework/application/ModuleGraph.ts",
);

function createModule(
  id: string,
  dependencies: readonly string[] = [],
): Module {
  return { id, dependencies };
}

async function loadModuleGraph(): Promise<ModuleGraphConstructor> {
  expect(existsSync(moduleGraphFile)).toBe(true);

  const exports = (await import(
    pathToFileURL(moduleGraphFile).href
  )) as ModuleGraphExports;

  expect(typeof exports.ModuleGraph).toBe("function");

  return exports.ModuleGraph as ModuleGraphConstructor;
}

describe("ModuleGraph validation", () => {
  test("rejects an empty module id", async () => {
    const ModuleGraph = await loadModuleGraph();

    expect(() => new ModuleGraph([createModule("")])).toThrow();
  });

  test("rejects duplicate module ids", async () => {
    const ModuleGraph = await loadModuleGraph();
    const first = createModule("inventory");
    const duplicate = createModule("inventory");

    expect(() => new ModuleGraph([first, duplicate])).toThrow();
  });

  test("rejects a missing dependency", async () => {
    const ModuleGraph = await loadModuleGraph();
    const inventory = createModule("inventory", ["logging"]);

    expect(() => new ModuleGraph([inventory])).toThrow();
  });

  test("rejects a self dependency cycle", async () => {
    const ModuleGraph = await loadModuleGraph();
    const inventory = createModule("inventory", ["inventory"]);

    expect(() => new ModuleGraph([inventory])).toThrow();
  });

  test("rejects a multi-module dependency cycle", async () => {
    const ModuleGraph = await loadModuleGraph();
    const inventory = createModule("inventory", ["economy"]);
    const economy = createModule("economy", ["analytics"]);
    const analytics = createModule("analytics", ["inventory"]);

    expect(() => new ModuleGraph([inventory, economy, analytics])).toThrow();
  });
});
