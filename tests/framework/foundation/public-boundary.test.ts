import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { describe, expect, test } from "bun:test";

type FrameworkLayer =
  | "root"
  | "core"
  | "contracts"
  | "application"
  | "diagnostics"
  | "adapters/cocos"
  | "adapters/memory"
  | "unknown";

interface ImportViolation {
  readonly file: string;
  readonly specifier: string;
  readonly reason: string;
}

const projectRoot = resolve(import.meta.dir, "../../..");
const assetsRoot = resolve(projectRoot, "assets");
const frameworkRoot = resolve(assetsRoot, "framework");
const frameworkPublicEntry = resolve(frameworkRoot, "index.ts");
const moduleContractsRoot = resolve(frameworkRoot, "contracts/module");
const gameRoot = resolve(assetsRoot, "game");
const bootRoot = resolve(assetsRoot, "boot");
const importScanner = new Bun.Transpiler({ loader: "ts" });

const allowedFrameworkDependencies: Readonly<
  Record<FrameworkLayer, readonly FrameworkLayer[]>
> = {
  root: ["core", "contracts", "application", "diagnostics"],
  core: ["core", "contracts"],
  contracts: ["core", "contracts"],
  application: ["core", "contracts", "application"],
  diagnostics: ["core", "contracts", "diagnostics"],
  "adapters/cocos": ["core", "contracts", "application", "adapters/cocos"],
  "adapters/memory": ["core", "contracts", "adapters/memory"],
  unknown: [],
};

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function isWithin(path: string, directory: string): boolean {
  const pathFromDirectory = relative(directory, path);
  return (
    pathFromDirectory === "" ||
    (!pathFromDirectory.startsWith("..") && !isAbsolute(pathFromDirectory))
  );
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

function stripComments(source: string): string {
  let result = "";
  let index = 0;
  let quote: '"' | "'" | "`" | undefined;

  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];

    if (current === undefined) {
      break;
    }

    if (quote !== undefined) {
      result += current;

      if (current === "\\" && next !== undefined) {
        result += next;
        index += 2;
        continue;
      }

      if (current === quote) {
        quote = undefined;
      }

      index += 1;
      continue;
    }

    if (current === '"' || current === "'" || current === "`") {
      quote = current;
      result += current;
      index += 1;
      continue;
    }

    if (current === "/" && next === "/") {
      result += "  ";
      index += 2;

      while (index < source.length && source[index] !== "\n") {
        result += " ";
        index += 1;
      }

      continue;
    }

    if (current === "/" && next === "*") {
      result += "  ";
      index += 2;

      while (index < source.length) {
        const blockCurrent = source[index];
        const blockNext = source[index + 1];

        if (blockCurrent === "*" && blockNext === "/") {
          result += "  ";
          index += 2;
          break;
        }

        result += blockCurrent === "\n" ? "\n" : " ";
        index += 1;
      }

      continue;
    }

    result += current;
    index += 1;
  }

  return result;
}

function extractModuleSpecifiers(source: string): readonly string[] {
  const sourceWithoutComments = stripComments(source);
  const specifiers = new Set(
    importScanner.scan(source).imports.map((entry) => entry.path),
  );
  const staticImportPattern =
    /^\s*(?:import|export)\b(?:[\s\S]*?\bfrom\s*)?["']([^"']+)["']/gm;
  const requirePattern = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of sourceWithoutComments.matchAll(staticImportPattern)) {
    const specifier = match[1];

    if (specifier !== undefined) {
      specifiers.add(specifier);
    }
  }

  for (const match of sourceWithoutComments.matchAll(requirePattern)) {
    const specifier = match[1];

    if (specifier !== undefined) {
      specifiers.add(specifier);
    }
  }

  return [...specifiers];
}

function resolveAliasedPath(
  specifier: string,
  prefix: string,
  targetRoot: string,
): string | undefined {
  if (specifier !== prefix && !specifier.startsWith(`${prefix}/`)) {
    return undefined;
  }

  const subpath = specifier.slice(prefix.length).replace(/^\/+/, "");
  return resolve(targetRoot, subpath);
}

function resolveImportTarget(importer: string, specifier: string): string | undefined {
  if (specifier.startsWith(".")) {
    return resolve(dirname(importer), specifier);
  }

  if (specifier.startsWith("db://assets/")) {
    return resolve(assetsRoot, specifier.slice("db://assets/".length));
  }

  if (specifier.startsWith("assets/")) {
    return resolve(projectRoot, specifier);
  }

  return (
    resolveAliasedPath(specifier, "@framework", frameworkRoot) ??
    resolveAliasedPath(specifier, "framework", frameworkRoot) ??
    resolveAliasedPath(specifier, "@game", gameRoot) ??
    resolveAliasedPath(specifier, "game", gameRoot)
  );
}

function getFrameworkLayer(path: string): FrameworkLayer | undefined {
  if (!isWithin(path, frameworkRoot)) {
    return undefined;
  }

  const pathFromFramework = normalizePath(relative(frameworkRoot, path));

  if (
    pathFromFramework === "" ||
    pathFromFramework === "index" ||
    pathFromFramework === "index.ts"
  ) {
    return "root";
  }

  if (pathFromFramework.startsWith("core/")) {
    return "core";
  }

  if (pathFromFramework.startsWith("contracts/")) {
    return "contracts";
  }

  if (pathFromFramework.startsWith("application/")) {
    return "application";
  }

  if (pathFromFramework.startsWith("diagnostics/")) {
    return "diagnostics";
  }

  if (pathFromFramework.startsWith("adapters/cocos/")) {
    return "adapters/cocos";
  }

  if (pathFromFramework.startsWith("adapters/memory/")) {
    return "adapters/memory";
  }

  return "unknown";
}

function isFrameworkPublicTarget(path: string): boolean {
  const pathFromFramework = normalizePath(relative(frameworkRoot, path));
  return (
    pathFromFramework === "" ||
    pathFromFramework === "index" ||
    pathFromFramework === "index.ts"
  );
}

function isCocosImport(specifier: string): boolean {
  return specifier === "cc" || specifier.startsWith("cc/");
}

function createViolation(
  file: string,
  specifier: string,
  reason: string,
): ImportViolation {
  return {
    file: normalizePath(relative(projectRoot, file)),
    specifier,
    reason,
  };
}

function validateFrameworkImport(
  file: string,
  sourceLayer: FrameworkLayer,
  specifier: string,
  target: string | undefined,
): ImportViolation | undefined {
  if (isCocosImport(specifier) && sourceLayer !== "adapters/cocos") {
    return createViolation(file, specifier, `${sourceLayer} cannot depend on Cocos`);
  }

  if (target !== undefined && isWithin(target, gameRoot)) {
    return createViolation(file, specifier, "Framework cannot depend on Game");
  }

  if (target !== undefined && isWithin(target, bootRoot)) {
    return createViolation(file, specifier, "Framework cannot depend on boot");
  }

  const targetLayer = target === undefined ? undefined : getFrameworkLayer(target);

  if (targetLayer === undefined) {
    return undefined;
  }

  if (targetLayer === "root" && sourceLayer !== "root") {
    return createViolation(
      file,
      specifier,
      "Framework internals cannot import the root barrel",
    );
  }

  if (!allowedFrameworkDependencies[sourceLayer].includes(targetLayer)) {
    return createViolation(
      file,
      specifier,
      `${sourceLayer} cannot depend on ${targetLayer}`,
    );
  }

  if (sourceLayer === "diagnostics" && targetLayer === "contracts") {
    const targetFromFramework = normalizePath(relative(frameworkRoot, target));

    if (
      targetFromFramework !== "contracts/logging" &&
      !targetFromFramework.startsWith("contracts/logging/")
    ) {
      return createViolation(
        file,
        specifier,
        "diagnostics/logging can only depend on contracts/logging",
      );
    }
  }

  if (
    isWithin(file, moduleContractsRoot) &&
    targetLayer === "contracts" &&
    target !== undefined
  ) {
    const targetFromFramework = normalizePath(relative(frameworkRoot, target));
    const isAllowedModuleContract =
      targetFromFramework === "contracts/module" ||
      targetFromFramework.startsWith("contracts/module/") ||
      targetFromFramework === "contracts/application" ||
      targetFromFramework.startsWith("contracts/application/");

    if (!isAllowedModuleContract) {
      return createViolation(
        file,
        specifier,
        "contracts/module can only depend on contracts/application and core",
      );
    }
  }

  return undefined;
}

function findImportViolations(file: string, source: string): readonly ImportViolation[] {
  const sourceLayer = getFrameworkLayer(file);

  return extractModuleSpecifiers(source).flatMap((specifier) => {
    const target = resolveImportTarget(file, specifier);

    if (sourceLayer === undefined) {
      if (isWithin(file, bootRoot)) {
        if (target !== undefined && isWithin(target, gameRoot)) {
          return [
            createViolation(file, specifier, "boot cannot depend on Game"),
          ];
        }
        return [];
      }

      if (
        target !== undefined &&
        isWithin(target, frameworkRoot) &&
        !isFrameworkPublicTarget(target)
      ) {
        return [
          createViolation(
            file,
            specifier,
            "External consumers must import the Framework root entry",
          ),
        ];
      }

      return [];
    }

    const violation = validateFrameworkImport(file, sourceLayer, specifier, target);
    return violation === undefined ? [] : [violation];
  });
}

function findProjectImportViolations(): readonly ImportViolation[] {
  return collectTypeScriptFiles(assetsRoot).flatMap((file) =>
    findImportViolations(file, readFileSync(file, "utf8")),
  );
}

function analyzeFixture(file: string, source: string): readonly ImportViolation[] {
  return findImportViolations(resolve(projectRoot, file), source);
}

function extractRootExportNames(source: string): readonly string[] {
  const names = new Set<string>();

  for (const match of source.matchAll(
    /\bexport\s+(?:type\s+)?\{([^}]*)\}\s*from\b/g,
  )) {
    const body = match[1];

    if (body === undefined) {
      continue;
    }

    for (const specifier of body.split(",")) {
      const local = specifier.split(/\s+as\s+/)[0]?.trim();

      if (local !== undefined && local.length > 0) {
        names.add(local);
      }
    }
  }

  for (const match of source.matchAll(
    /\bexport\s+(?:declare\s+)?(?:class|interface|type|const|function|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
  )) {
    const name = match[1];

    if (name !== undefined) {
      names.add(name);
    }
  }

  return [...names].sort();
}

describe("framework public boundary", () => {
  test("provides a root public entry", () => {
    expect(existsSync(frameworkPublicEntry)).toBe(true);
  });

  test("exports exactly the stable public API whitelist", () => {
    const source = readFileSync(frameworkPublicEntry, "utf8");

    expect(source).not.toMatch(/\bexport\s+\*/);

    const expectedRootExports = [
      "Application",
      "ApplicationContext",
      "ApplicationLifecycle",
      "ApplicationState",
      "ApplicationStateError",
      "ApplicationVisibility",
      "ApplicationVisibilityState",
      "createObjectPool",
      "createScopedEventChannel",
      "createStateMachine",
      "DeviceInfo",
      "DisposeHandle",
      "EventMap",
      "FrameworkError",
      "FrameworkErrorOptions",
      "IResourceProvider",
      "isRecoverableError",
      "LogContext",
      "LogLevel",
      "LogRecord",
      "Logger",
      "Module",
      "ModuleLifecycleError",
      "ModulePhase",
      "ModuleRuntimeState",
      "ObjectPool",
      "ObjectPoolOptions",
      "PlatformStorage",
      "ResourceHandle",
      "ResourceKey",
      "ResourceKind",
      "ResourceLoadState",
      "ResourceProviderOptions",
      "ResourceScope",
      "ScopedEventChannel",
      "ScopedEventChannelOptions",
      "StateHook",
      "StateMachine",
      "StateMachineHooks",
      "StateMachineOptions",
      "StateTransitionTable",
      "TimeSource",
      "createResourceProvider",
    ].sort();

    expect(extractRootExportNames(source)).toEqual(expectedRootExports);
  });

  test("never leaks framework internals from the root entry", () => {
    const source = readFileSync(frameworkPublicEntry, "utf8");
    const exportedNames = extractRootExportNames(source);
    const forbiddenInternals = [
      "ModuleGraph",
      "ModuleRunner",
      "ScopedLogger",
      "ConsoleLogger",
      "MemoryLogger",
      "createScopedLogger",
      "LogRecordSink",
      "CocosApplicationAdapter",
      "createCocosResourceProvider",
    ];

    for (const name of forbiddenInternals) {
      expect(exportedNames).not.toContain(name);
    }
  });

  test("allows external consumers to import only the root entry", () => {
    const source = `
      import type { Application } from "../framework";
      export type { Module } from "../framework/index";
      const framework = import("db://assets/framework");
    `;

    expect(analyzeFixture("assets/game/Feature.ts", source)).toEqual([]);
  });

  test("rejects relative and aliased external deep imports", () => {
    const source = `
      import type { Application } from "../framework/application/Application";
      import type { Module } from "@framework/contracts/module/Module";
    `;

    expect(
      analyzeFixture("assets/game/Feature.ts", source).map(
        ({ specifier, reason }) => ({ specifier, reason }),
      ),
    ).toEqual([
      {
        specifier: "../framework/application/Application",
        reason: "External consumers must import the Framework root entry",
      },
      {
        specifier: "@framework/contracts/module/Module",
        reason: "External consumers must import the Framework root entry",
      },
    ]);
  });

  test("allows the declared internal dependency direction", () => {
    const fixtures = [
      analyzeFixture(
        "assets/framework/core/lifecycle/State.ts",
        'import type { Failure } from "../errors/Failure";',
      ),
      analyzeFixture(
        "assets/framework/contracts/module/Module.ts",
        'import type { State } from "../../core/lifecycle/State";',
      ),
      analyzeFixture(
        "assets/framework/application/Application.ts",
        'import type { Module } from "../contracts/module/Module";',
      ),
      analyzeFixture(
        "assets/framework/diagnostics/logging/ConsoleLogger.ts",
        'import type { Logger } from "../../contracts/logging/Logger";',
      ),
      analyzeFixture(
        "assets/framework/adapters/cocos/application/CocosApplicationAdapter.ts",
        `
          import { game } from "cc";
          import type { Application } from "../../../application/Application";
        `,
      ),
      analyzeFixture(
        "assets/boot/AppRoot.ts",
        `
          import { _decorator, Component, game } from "cc";
          import { Application } from "../framework";
          import { createApplicationContext } from "../framework/application/ApplicationContext";
          import { ConsoleLogger } from "../framework/diagnostics/logging/ConsoleLogger";
          import { CocosApplicationAdapter } from "../framework/adapters/cocos/application/CocosApplicationAdapter";
        `,
      ),
    ];

    expect(fixtures).toEqual([[], [], [], [], [], []]);
  });

  test("allows core implementations to depend on contracts for time", () => {
    const source = `
      import type { TimeSource } from "../../contracts/time/TimeSource";
    `;

    expect(
      analyzeFixture("assets/framework/core/time/WallClock.ts", source),
    ).toEqual([]);
  });

  test("allows memory adapters to depend on core and contracts only", () => {
    const source = `
      import type { PlatformStorage } from "../../contracts/platform/Platform";
      import type { TimeSource } from "../../contracts/time/TimeSource";
      import type { SimulationClock } from "../../core/time/SimulationClock";
    `;

    expect(
      analyzeFixture("assets/framework/adapters/memory/MemoryPlatform.ts", source),
    ).toEqual([]);
  });

  test("rejects runtime, reverse and cross-adapter dependencies from memory adapters", () => {
    const source = `
      import { game } from "cc";
      import type { ApplicationContext } from "../../contracts/application/ApplicationContext";
      import type { Application } from "../../application/Application";
      import { ConsoleLogger } from "../../diagnostics/logging/ConsoleLogger";
      import { CocosApplicationAdapter } from "../../adapters/cocos/application/CocosApplicationAdapter";
      import type { Battle } from "../../../game/Battle";
    `;

    expect(
      Object.fromEntries(
        analyzeFixture(
          "assets/framework/adapters/memory/MemoryPlatform.ts",
          source,
        ).map(({ specifier, reason }) => [specifier, reason]),
      ),
    ).toEqual({
      cc: "adapters/memory cannot depend on Cocos",
      "../../application/Application":
        "adapters/memory cannot depend on application",
      "../../diagnostics/logging/ConsoleLogger":
        "adapters/memory cannot depend on diagnostics",
      "../../adapters/cocos/application/CocosApplicationAdapter":
        "adapters/memory cannot depend on adapters/cocos",
      "../../../game/Battle": "Framework cannot depend on Game",
    });
  });

  test("allows contracts/module to depend on contracts/application and core", () => {
    const source = `
      import type { ApplicationContext } from "../application/ApplicationContext";
      import type { LifecycleState } from "../../core/lifecycle/LifecycleState";
    `;

    expect(
      analyzeFixture("assets/framework/contracts/module/Module.ts", source),
    ).toEqual([]);
  });

  test("rejects forbidden contracts/module architecture dependencies", () => {
    const source = `
      import type { ApplicationContext } from "../../application/ApplicationContext";
      import type { CocosAdapter } from "../../adapters/cocos/application/CocosAdapter";
      import type { ConsoleLogger } from "../../diagnostics/logging/ConsoleLogger";
      import type { Logger } from "../logging/Logger";
      import { Component } from "cc";
    `;

    const violations = analyzeFixture(
      "assets/framework/contracts/module/Module.ts",
      source,
    );

    expect(
      Object.fromEntries(
        violations.map(({ specifier, reason }) => [specifier, reason]),
      ),
    ).toEqual({
      "../../application/ApplicationContext":
        "contracts cannot depend on application",
      "../../adapters/cocos/application/CocosAdapter":
        "contracts cannot depend on adapters/cocos",
      "../../diagnostics/logging/ConsoleLogger":
        "contracts cannot depend on diagnostics",
      "../logging/Logger":
        "contracts/module can only depend on contracts/application and core",
      cc: "contracts cannot depend on Cocos",
    });
  });

  test("rejects reverse, concrete, Cocos, boot and Game dependencies", () => {
    const fixtures = [
      analyzeFixture(
        "assets/framework/core/lifecycle/State.ts",
        'import { game } from "cc";',
      ),
      analyzeFixture(
        "assets/framework/contracts/module/Module.ts",
        'import type { Context } from "../../application/ApplicationContext";',
      ),
      analyzeFixture(
        "assets/framework/application/Application.ts",
        'import { ConsoleLogger } from "../diagnostics/logging/ConsoleLogger";',
      ),
      analyzeFixture(
        "assets/framework/application/Application.ts",
        'import type { Battle } from "../../game/Battle";',
      ),
      analyzeFixture(
        "assets/framework/diagnostics/logging/ConsoleLogger.ts",
        'import type { Application } from "../../application/Application";',
      ),
      analyzeFixture(
        "assets/framework/adapters/cocos/application/CocosApplicationAdapter.ts",
        'import { AppRoot } from "../../../../boot/AppRoot";',
      ),
      analyzeFixture(
        "assets/framework/contracts/module/Module.ts",
        'import type { Framework } from "../../index";',
      ),
    ];

    expect(fixtures.map((violations) => violations[0]?.reason)).toEqual([
      "core cannot depend on Cocos",
      "contracts cannot depend on application",
      "application cannot depend on diagnostics",
      "Framework cannot depend on Game",
      "diagnostics cannot depend on application",
      "Framework cannot depend on boot",
      "Framework internals cannot import the root barrel",
    ]);
  });

  test("rejects boot depending on Game", () => {
    const source = `
      import type { Battle } from "../game/Battle";
      import { InventoryService } from "../game/inventory/InventoryService";
    `;

    const violations = analyzeFixture("assets/boot/AppRoot.ts", source);

    expect(violations).toHaveLength(2);
    expect(violations.map(({ reason }) => reason)).toEqual([
      "boot cannot depend on Game",
      "boot cannot depend on Game",
    ]);
  });

  test("ignores import-like text in comments", () => {
    const source = `
      // import type { Application } from "../framework/application/Application";
      /* const game = require("@game/Battle"); */
      export {};
    `;

    expect(analyzeFixture("assets/game/Feature.ts", source)).toEqual([]);
  });

  test("checks require and TypeScript import-equals dependencies", () => {
    const source = `
      import Battle = require("@game/Battle");
      const cocos = require("cc");
    `;

    expect(
      analyzeFixture("assets/framework/application/Application.ts", source).map(
        ({ specifier, reason }) => ({ specifier, reason }),
      ),
    ).toEqual([
      {
        specifier: "@game/Battle",
        reason: "Framework cannot depend on Game",
      },
      {
        specifier: "cc",
        reason: "application cannot depend on Cocos",
      },
    ]);
  });

  test("keeps all current asset imports within architecture boundaries", () => {
    expect(findProjectImportViolations()).toEqual([]);
  });

  test("locks the resource layer dependency boundary", () => {
    const allowed = [
      analyzeFixture(
        "assets/framework/core/resource/LoadCoordinator.ts",
        'import { FrameworkError } from "../errors/FrameworkError";',
      ),
    ];

    expect(allowed).toEqual([[]]);

    const violations = analyzeFixture(
      "assets/framework/core/resource/LoadCoordinator.ts",
      `
        import { assetManager } from "cc";
        import type { Application } from "../../application/Application";
        import { ConsoleLogger } from "../../diagnostics/logging/ConsoleLogger";
        import { CocosApplicationAdapter } from "../../adapters/cocos/application/CocosApplicationAdapter";
        import type { Battle } from "../../../game/Battle";
        import type { Framework } from "../../index";
      `,
    );

    expect(
      Object.fromEntries(
        violations.map(({ specifier, reason }) => [specifier, reason]),
      ),
    ).toEqual({
      cc: "core cannot depend on Cocos",
      "../../application/Application": "core cannot depend on application",
      "../../diagnostics/logging/ConsoleLogger":
        "core cannot depend on diagnostics",
      "../../adapters/cocos/application/CocosApplicationAdapter":
        "core cannot depend on adapters/cocos",
      "../../../game/Battle": "Framework cannot depend on Game",
      "../../index": "Framework internals cannot import the root barrel",
    });
  });

  test("keeps the resource core layer engine-agnostic", () => {
    const coreFiles = collectTypeScriptFiles(resolve(frameworkRoot, "core/resource"));
    expect(coreFiles.length).toBeGreaterThan(0);

    const coreSources = coreFiles
      .map((file) => stripComments(readFileSync(file, "utf8")))
      .join("\n");

    expect(coreSources).not.toMatch(/from\s*["']cc(?:["']|\/)/);
    expect(coreSources).not.toMatch(
      /\b(?:getInstance|singleton|ServiceLocator)\b/,
    );
  });

  test.skipIf(
    !existsSync(resolve(frameworkRoot, "contracts/resource")),
  )("keeps resource contracts free of core implementations", () => {
    const contractsResourceRoot = resolve(frameworkRoot, "contracts/resource");

    for (const file of collectTypeScriptFiles(contractsResourceRoot)) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect(source).not.toMatch(/from\s*["'][^"']*core\/resource/);
    }
  });

  test("keeps platform, time and scheduling layers free of service locators and global singletons", () => {
    const newLayerRoots = [
      resolve(frameworkRoot, "contracts/platform"),
      resolve(frameworkRoot, "contracts/time"),
      resolve(frameworkRoot, "core/time"),
      resolve(frameworkRoot, "core/scheduling"),
      resolve(frameworkRoot, "adapters/memory"),
    ];

    const sources = newLayerRoots
      .flatMap((root) => collectTypeScriptFiles(root))
      .map((file) => stripComments(readFileSync(file, "utf8")))
      .join("\n");

    expect(sources).not.toMatch(/\b(?:getInstance|singleton|ServiceLocator)\b/);
    expect(sources).not.toMatch(/\b(?:globalThis|window)\b/);
    expect(sources).not.toMatch(
      /\bstatic\s+(?:readonly\s+)?(?:instance|shared)\b/,
    );
  });
});
