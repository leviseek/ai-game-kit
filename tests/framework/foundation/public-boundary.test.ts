import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { describe, expect, test } from "bun:test";

type FrameworkLayer = "root" | "core" | "contracts" | "application" | "diagnostics" | "adapters/cocos" | "adapters/memory" | "unknown";

interface ImportViolation {
    readonly file: string;
    readonly specifier: string;
    readonly reason: string;
}

const projectRoot = resolve(import.meta.dir, "../../..");
const assetsRoot = resolve(projectRoot, "assets");
const frameworkRoot = resolve(assetsRoot, "framework");
const frameworkVendorRoot = resolve(frameworkRoot, "libs");
const frameworkPublicEntry = resolve(frameworkRoot, "index.ts");
const moduleContractFileRoot = resolve(frameworkRoot, "contracts/interfaces/IModule.ts");
const gameRoot = resolve(assetsRoot, "game");
const samplesRoot = resolve(assetsRoot, "samples");
const bootRoot = resolve(assetsRoot, "boot");
const importScanner = new Bun.Transpiler({ loader: "ts" });

const allowedFrameworkDependencies: Readonly<Record<FrameworkLayer, readonly FrameworkLayer[]>> = {
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
    return pathFromDirectory === "" || (!pathFromDirectory.startsWith("..") && !isAbsolute(pathFromDirectory));
}

/**
 * 判断文件是否属于游戏层：`assets/game` 及其子目录、`assets/samples`（品类
 * bundle 目录），或顶层品类目录 `assets/game_*`。游戏层作为外部消费者，只能
 * 经框架根入口导入框架。
 *
 * 命名约定：游戏层品类目录 MUST 使用 `game_` 前缀（如 game_rpg/game_card），
 * 该前缀是边界检查识别游戏层的依据；`assets/samples` 在 Task 4 合并后承载
 * 品类代码，与 `assets/game` 同属游戏层；`assets/game-content` 等非品类目录
 * 不属于游戏层，不受本判定约束。
 */
function isGameLayerFile(path: string): boolean {
    if (isWithin(path, gameRoot)) {
        return true;
    }

    if (isWithin(path, samplesRoot)) {
        return true;
    }

    const pathFromAssets = normalizePath(relative(assetsRoot, path));
    const topLevelDirectory = pathFromAssets.split("/")[0] ?? "";
    return topLevelDirectory.startsWith("game_");
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
    const specifiers = new Set(importScanner.scan(source).imports.map((entry) => entry.path));
    const staticImportPattern = /^\s*(?:import|export)\b(?:[\s\S]*?\bfrom\s*)?["']([^"']+)["']/gm;
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

function resolveAliasedPath(specifier: string, prefix: string, targetRoot: string): string | undefined {
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

    if (isWithin(path, frameworkVendorRoot)) {
        // vendor 目录（如 libs/fairygui）不是框架源码分层，不套用分层依赖约束
        return undefined;
    }

    if (pathFromFramework === "" || pathFromFramework === "index" || pathFromFramework === "index.ts") {
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
    return pathFromFramework === "" || pathFromFramework === "index" || pathFromFramework === "index.ts";
}

function isCocosImport(specifier: string): boolean {
    return specifier === "cc" || specifier.startsWith("cc/");
}

function createViolation(file: string, specifier: string, reason: string): ImportViolation {
    return {
        file: normalizePath(relative(projectRoot, file)),
        specifier,
        reason,
    };
}

function validateFrameworkImport(file: string, sourceLayer: FrameworkLayer, specifier: string, target: string | undefined): ImportViolation | undefined {
    if (isCocosImport(specifier) && sourceLayer !== "adapters/cocos") {
        return createViolation(file, specifier, `${sourceLayer} cannot depend on Cocos`);
    }

    if (target !== undefined && isGameLayerFile(target)) {
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
        return createViolation(file, specifier, "Framework internals cannot import the root barrel");
    }

    if (!allowedFrameworkDependencies[sourceLayer].includes(targetLayer)) {
        return createViolation(file, specifier, `${sourceLayer} cannot depend on ${targetLayer}`);
    }

    if (sourceLayer === "diagnostics" && targetLayer === "contracts") {
        const targetFromFramework = normalizePath(relative(frameworkRoot, target));

        // 契约扁平化后 diagnostics 只允许依赖契约层（interfaces 的 Logger 契约
        // 与 enums 的 LogLevel 值），其余契约模块不在其依赖面
        if (
            targetFromFramework !== "contracts/interfaces" &&
            !targetFromFramework.startsWith("contracts/interfaces/") &&
            targetFromFramework !== "contracts/enums" &&
            !targetFromFramework.startsWith("contracts/enums/")
        ) {
            return createViolation(file, specifier, "diagnostics/logging can only depend on contracts interfaces/enums");
        }
    }

    if (isWithin(file, moduleContractFileRoot) && targetLayer === "contracts" && target !== undefined) {
        const targetFromFramework = normalizePath(relative(frameworkRoot, target));
        // Module 契约只允许依赖 Application 契约（同 interfaces 目录内）与 core
        const isAllowedModuleContract = targetFromFramework === "contracts/interfaces/IApplicationContext" || targetFromFramework.startsWith("contracts/interfaces/IApplicationContext/");

        if (!isAllowedModuleContract) {
            return createViolation(file, specifier, "contracts/interfaces/IModule can only depend on contracts/interfaces/IApplicationContext and core");
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
                // 组合根（boot）是唯一允许"知道所有具体实现"的装配层：可依赖框架内部
                // 与游戏层夹具（design decision 3/4），AppRoot 只做薄转发不承载业务规则。
                return [];
            }

            if (isGameLayerFile(file) && target !== undefined && isWithin(target, bootRoot)) {
                // 依赖方向单向：boot 可依赖 game，game 不得反向依赖 boot
                return [createViolation(file, specifier, "Game cannot depend on boot")];
            }

            if (target !== undefined && isWithin(target, frameworkRoot) && !isFrameworkPublicTarget(target)) {
                return [createViolation(file, specifier, "External consumers must import the Framework root entry")];
            }

            return [];
        }

        const violation = validateFrameworkImport(file, sourceLayer, specifier, target);
        return violation === undefined ? [] : [violation];
    });
}

function findProjectImportViolations(): readonly ImportViolation[] {
    return collectTypeScriptFiles(assetsRoot).flatMap((file) => findImportViolations(file, readFileSync(file, "utf8")));
}

function analyzeFixture(file: string, source: string): readonly ImportViolation[] {
    return findImportViolations(resolve(projectRoot, file), source);
}

function extractRootExportNames(source: string): readonly string[] {
    const names = new Set<string>();

    for (const match of source.matchAll(/\bexport\s+(?:type\s+)?\{([^}]*)\}\s*from\b/g)) {
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

    for (const match of source.matchAll(/\bexport\s+(?:declare\s+)?(?:class|interface|type|const|function|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
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
            "ApplicationStateError",
            "Binding",
            "BundleModuleRegistry",
            "ConfigLoadError",
            "ConfigMissingError",
            "ConfigParseError",
            "ConfigTypeMismatchError",
            "DisposeHandle",
            "EaseCurve",
            "EnumApplicationState",
            "EnumApplicationVisibilityState",
            "EnumAudioGroup",
            "EnumDuplicateOpenPolicy",
            "EnumLogLevel",
            "EnumModulePhase",
            "EnumModuleRuntimeState",
            "EnumPauseDomain",
            "EnumResourceKind",
            "EnumResourceLoadState",
            "EnumUiLayer",
            "EventMap",
            "FClick",
            "FUIBind",
            "FrameworkError",
            "FrameworkErrorOptions",
            "FuiBindOptions",
            "FuiComponentEntry",
            "FuiComponentRegistrationError",
            "FuiComponentRegistry",
            "FuiComponentUrl",
            "FuiView",
            "FuiViewBinding",
            "FuiViewBindingRegistrar",
            "FuiViewBindingScope",
            "FuiViewCleanupError",
            "GameClock",
            "GameFixture",
            "GameFixtureOptions",
            "IAction",
            "IApplicationContext",
            "IApplicationLifecycle",
            "IApplicationVisibility",
            "IAudioBackend",
            "IAudioBackgroundPolicy",
            "IAudioGroupState",
            "IAudioPlayScope",
            "IAudioService",
            "IAudioServiceOptions",
            "IAudioTrackRef",
            "IBindable",
            "ICommandBinding",
            "IConfigKey",
            "IConfigReadType",
            "IConfigTable",
            "IDeviceInfo",
            "IEnabledBinding",
            "IFairyGuiListHandle",
            "IFairyGuiListItemView",
            "IFuiClickMeta",
            "IFuiView",
            "IFuiViewSeam",
            "IInputContextId",
            "IInputEvent",
            "IInputMapping",
            "IInputSample",
            "IInputSource",
            "IInputSourceId",
            "ILogContext",
            "ILogRecord",
            "ILogger",
            "IModule",
            "IMotionTweenOptions",
            "IPlatformStorage",
            "IPositionBinding",
            "IProgressBinding",
            "IReadonlyConfigSnapshot",
            "IResourceHandle",
            "IResourceKey",
            "IResourceProvider",
            "IResourceProviderOptions",
            "IResourceScope",
            "IStore",
            "IStoreListener",
            "ITextBinding",
            "ITimeSource",
            "ITypedButtonNode",
            "ITypedComponentNode",
            "ITypedImageNode",
            "ITypedInputNode",
            "ITypedListNode",
            "ITypedNode",
            "ITypedProgressNode",
            "ITypedTextNode",
            "IUiPage",
            "IUiResult",
            "IViewModelNode",
            "IVisibleBinding",
            "InputMapper",
            "InputMapperOptions",
            "ModuleLifecycleError",
            "MotionTween",
            "MotionTweenRuntimeOptions",
            "ObjectPool",
            "ObjectPoolOptions",
            "PassiveScheduler",
            "PassiveSchedulerOptions",
            "SceneFlow",
            "SceneFlowOptions",
            "SceneFlowState",
            "SceneResources",
            "SceneSwitchResult",
            "ScheduleOptions",
            "ScopedEventChannel",
            "ScopedEventChannelOptions",
            "ServiceRegistrationError",
            "ServiceRegistry",
            "ServiceResolutionError",
            "ServiceToken",
            "SimulationClock",
            "SimulationClockOptions",
            "StateHook",
            "StateMachine",
            "StateMachineHooks",
            "StateMachineOptions",
            "StateTransitionTable",
            "UI_LAYER_ORDER",
            "UiNavigator",
            "UiNavigatorOptions",
            "ViewModelRenderer",
            "ViewModelRendererOptions",
            "WallClock",
            "configArray",
            "configBoolean",
            "configNumber",
            "configObject",
            "configString",
            "createApplicationContext",
            "createAudioService",
            "createBindable",
            "createConfigTable",
            "createGameFixture",
            "createInputMapper",
            "createMotionTween",
            "createObjectPool",
            "createResourceProvider",
            "createSceneFlow",
            "createScopedEventChannel",
            "createServiceRegistry",
            "createServiceToken",
            "createStateMachine",
            "createStore",
            "createUiNavigator",
            "createViewModelRenderer",
            "defineFuiViewBinding",
            "easeOutCubic",
            "easeOutQuad",
            "getBundleModuleRegistry",
            "getFuiComponentRegistry",
            "isRecoverableError",
            "loadConfigTable",
            "lookupBundle",
            "registerBundle",
        ];

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
            "createCocosSceneAdapter",
            "createCocosUiRoot",
            "createFairyGuiPageAdapter",
            "createFairyGuiView",
            "createCocosStorageAdapter",
            "createSaveCoordinator",
            "FuiViewBindingResolver",
            "createFuiViewBinderRegistry",
            "createFuiViewBindingScope",
        ];

        for (const name of forbiddenInternals) {
            expect(exportedNames).not.toContain(name);
        }
    });

    test("allows external consumers to import only the root entry", () => {
        const source = `
      import type { Application } from "../framework";
      export type { IModule } from "../framework/index";
      const framework = import("db://assets/framework");
    `;

        expect(analyzeFixture("assets/game/Feature.ts", source)).toEqual([]);
    });

    test("rejects relative and aliased external deep imports", () => {
        const source = `
      import type { Application } from "../framework/application/Application";
      import type { IModule } from "@framework/contracts/interfaces/IModule";
    `;

        expect(analyzeFixture("assets/game/Feature.ts", source).map(({ specifier, reason }) => ({ specifier, reason }))).toEqual([
            {
                specifier: "../framework/application/Application",
                reason: "External consumers must import the Framework root entry",
            },
            {
                specifier: "@framework/contracts/interfaces/IModule",
                reason: "External consumers must import the Framework root entry",
            },
        ]);
    });

    test("allows the declared internal dependency direction", () => {
        const fixtures = [
            analyzeFixture("assets/framework/core/lifecycle/State.ts", 'import type { Failure } from "../errors/Failure";'),
            analyzeFixture("assets/framework/contracts/interfaces/IModule.ts", 'import type { State } from "../../core/lifecycle/State";'),
            analyzeFixture("assets/framework/application/Application.ts", 'import type { IModule } from "../contracts/interfaces/IModule";'),
            analyzeFixture("assets/framework/diagnostics/logging/ConsoleLogger.ts", 'import type { ILogger } from "../../contracts/interfaces/ILogger";'),
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
      import type { ITimeSource } from "../../contracts/interfaces/ITimeSource";
    `;

        expect(analyzeFixture("assets/framework/core/time/WallClock.ts", source)).toEqual([]);
    });

    test("allows memory adapters to depend on core and contracts only", () => {
        const source = `
      import type { IPlatformStorage } from "../../contracts/interfaces/IPlatformStorage";
      import type { ITimeSource } from "../../contracts/interfaces/ITimeSource";
      import type { SimulationClock } from "../../core/time/SimulationClock";
    `;

        expect(analyzeFixture("assets/framework/adapters/memory/MemoryPlatform.ts", source)).toEqual([]);
    });

    test("rejects runtime, reverse and cross-adapter dependencies from memory adapters", () => {
        const source = `
      import { game } from "cc";
      import type { IApplicationContext } from "../../contracts/interfaces/IApplicationContext";
      import type { Application } from "../../application/Application";
      import { ConsoleLogger } from "../../diagnostics/logging/ConsoleLogger";
      import { CocosApplicationAdapter } from "../../adapters/cocos/application/CocosApplicationAdapter";
      import type { Battle } from "../../../game/Battle";
    `;

        expect(Object.fromEntries(analyzeFixture("assets/framework/adapters/memory/MemoryPlatform.ts", source).map(({ specifier, reason }) => [specifier, reason]))).toEqual({
            cc: "adapters/memory cannot depend on Cocos",
            "../../application/Application": "adapters/memory cannot depend on application",
            "../../diagnostics/logging/ConsoleLogger": "adapters/memory cannot depend on diagnostics",
            "../../adapters/cocos/application/CocosApplicationAdapter": "adapters/memory cannot depend on adapters/cocos",
            "../../../game/Battle": "Framework cannot depend on Game",
        });
    });

    test("allows contracts/interfaces Module to depend on Application contract and core", () => {
        const source = `
      import type { IApplicationContext } from "./IApplicationContext";
      import type { LifecycleState } from "../../core/lifecycle/LifecycleState";
    `;

        expect(analyzeFixture("assets/framework/contracts/interfaces/IModule.ts", source)).toEqual([]);
    });

    test("rejects forbidden contracts/interfaces Module architecture dependencies", () => {
        const source = `
      import type { IApplicationContext } from "../../application/ApplicationContext";
      import type { CocosAdapter } from "../../adapters/cocos/application/CocosAdapter";
      import type { ConsoleLogger } from "../../diagnostics/logging/ConsoleLogger";
      import type { ILogger } from "../interfaces/ILogger";
      import { Component } from "cc";
    `;

        const violations = analyzeFixture("assets/framework/contracts/interfaces/IModule.ts", source);

        expect(Object.fromEntries(violations.map(({ specifier, reason }) => [specifier, reason]))).toEqual({
            "../../application/ApplicationContext": "contracts cannot depend on application",
            "../../adapters/cocos/application/CocosAdapter": "contracts cannot depend on adapters/cocos",
            "../../diagnostics/logging/ConsoleLogger": "contracts cannot depend on diagnostics",
            "../interfaces/ILogger": "contracts/interfaces/IModule can only depend on contracts/interfaces/IApplicationContext and core",
            cc: "contracts cannot depend on Cocos",
        });
    });

    test("rejects reverse, concrete, Cocos, boot and Game dependencies", () => {
        const fixtures = [
            analyzeFixture("assets/framework/core/lifecycle/State.ts", 'import { game } from "cc";'),
            analyzeFixture("assets/framework/contracts/interfaces/IModule.ts", 'import type { Context } from "../../application/ApplicationContext";'),
            analyzeFixture("assets/framework/application/Application.ts", 'import { ConsoleLogger } from "../diagnostics/logging/ConsoleLogger";'),
            analyzeFixture("assets/framework/application/Application.ts", 'import type { Battle } from "../../game/Battle";'),
            analyzeFixture("assets/framework/diagnostics/logging/ConsoleLogger.ts", 'import type { Application } from "../../application/Application";'),
            analyzeFixture("assets/framework/adapters/cocos/application/CocosApplicationAdapter.ts", 'import { AppRoot } from "../../../../boot/AppRoot";'),
            analyzeFixture("assets/framework/contracts/interfaces/IModule.ts", 'import type { Framework } from "../../index";'),
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

    test("rejects framework deep imports into game category directories", () => {
        // 框架内核不得反向依赖任何游戏层目录：既包括 assets/game，也包括顶层
        // game_* 品类目录（2.x 起各品类在此建业务模型，漏检会让负向断言失真）
        const fixtures = [
            analyzeFixture("assets/framework/application/Application.ts", 'import type { Battle } from "../../game_rpg/Battle";'),
            analyzeFixture("assets/framework/contracts/interfaces/IModule.ts", 'import { CardDeck } from "../../../game_card/CardDeck";'),
        ];

        expect(fixtures.map((violations) => violations[0]?.reason)).toEqual(["Framework cannot depend on Game", "Framework cannot depend on Game"]);
    });

    test("allows boot to depend on Game as the composition root", () => {
        // 组合根是唯一允许"知道所有具体实现"的装配层：可依赖游戏层夹具做薄转发。
        // 但框架内核（core/contracts/application/diagnostics/adapters）仍不得反向依赖 Game。
        const source = `
      import { runFixtureSmoke } from "../game/fixture/smoke";
      import { gameFixtureRegistry } from "../game/fixture/registry";
    `;

        expect(analyzeFixture("assets/boot/AppRoot.ts", source)).toEqual([]);
    });

    test("keeps Game as an external consumer of the framework root entry", () => {
        // 游戏层夹具只能经框架根入口导入框架，不得深层导入框架内部；
        // 也不得反向依赖 boot（组合根依赖方向单向：boot → game）
        const source = `
      import type { GameFixture } from "./fixture/GameFixture";
      import type { Application } from "../../framework";
      import type { IModule } from "../../framework/application/Application";
      import { AppRoot } from "../../boot/AppRoot";
    `;

        const violations = analyzeFixture("assets/game/fixture/GameFixture.ts", source);

        expect(violations.map(({ specifier, reason }) => ({ specifier, reason })).sort((left, right) => left.specifier.localeCompare(right.specifier))).toEqual(
            [
                {
                    specifier: "../../framework/application/Application",
                    reason: "External consumers must import the Framework root entry",
                },
                {
                    specifier: "../../boot/AppRoot",
                    reason: "Game cannot depend on boot",
                },
            ].sort((left, right) => left.specifier.localeCompare(right.specifier)),
        );
    });

    test("treats game category directories as external consumers of the framework root entry", () => {
        // 品类目录（assets/game_*）与 assets/game 同属游戏层外部消费者：
        // 允许经框架根入口导入框架与游戏层公共装配入口，禁止深层导入与反向依赖 boot
        const allowed = [
            analyzeFixture(
                "assets/game_rpg/assembly.ts",
                `
          import type { GameFixture } from "../game/fixture/GameFixture";
          import { createGameFixture } from "../game/fixture/GameFixture";
          import type { Application } from "../framework";
        `,
            ),
            analyzeFixture(
                "assets/game_card/assembly.ts",
                `
          import { runFixtureSmoke } from "../game/fixture/smoke";
          import type { IModule } from "../framework";
        `,
            ),
        ];

        expect(allowed).toEqual([[], []]);

        const violations = analyzeFixture(
            "assets/game_rpg/assembly.ts",
            `
        import type { IModule } from "../framework/application/ModuleRunner";
        import type { StateMachine } from "@framework/core/fsm/StateMachine";
        import { AppRoot } from "../boot/AppRoot";
        import { createFairyGuiView } from "../framework/adapters/cocos/ui/FairyGuiPageAdapter";
      `,
        );

        expect(violations.map(({ specifier, reason }) => ({ specifier, reason })).sort((left, right) => left.specifier.localeCompare(right.specifier))).toEqual(
            [
                {
                    specifier: "../framework/application/ModuleRunner",
                    reason: "External consumers must import the Framework root entry",
                },
                {
                    specifier: "@framework/core/fsm/StateMachine",
                    reason: "External consumers must import the Framework root entry",
                },
                {
                    specifier: "../boot/AppRoot",
                    reason: "Game cannot depend on boot",
                },
                {
                    specifier: "../framework/adapters/cocos/ui/FairyGuiPageAdapter",
                    reason: "External consumers must import the Framework root entry",
                },
            ].sort((left, right) => left.specifier.localeCompare(right.specifier)),
        );
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

        expect(analyzeFixture("assets/framework/application/Application.ts", source).map(({ specifier, reason }) => ({ specifier, reason }))).toEqual([
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
        const allowed = [analyzeFixture("assets/framework/core/resource/LoadCoordinator.ts", 'import { FrameworkError } from "../errors/FrameworkError";')];

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

        expect(Object.fromEntries(violations.map(({ specifier, reason }) => [specifier, reason]))).toEqual({
            cc: "core cannot depend on Cocos",
            "../../application/Application": "core cannot depend on application",
            "../../diagnostics/logging/ConsoleLogger": "core cannot depend on diagnostics",
            "../../adapters/cocos/application/CocosApplicationAdapter": "core cannot depend on adapters/cocos",
            "../../../game/Battle": "Framework cannot depend on Game",
            "../../index": "Framework internals cannot import the root barrel",
        });
    });

    test("keeps the resource package extension free of fgui imports", () => {
        const resourceRoots = [resolve(frameworkRoot, "core/resource"), resolve(frameworkRoot, "contracts/interfaces")];

        for (const root of resourceRoots) {
            for (const file of collectTypeScriptFiles(root)) {
                const source = stripComments(readFileSync(file, "utf8"));
                expect(source).not.toMatch(/from\s*["']fairygui(?:-cc)?(?:["']|\/)/);
            }
        }
    });

    test("keeps the package kind pinned to the provider entry only", () => {
        const coreResourceFiles = collectTypeScriptFiles(resolve(frameworkRoot, "core/resource"));

        for (const file of coreResourceFiles) {
            const source = stripComments(readFileSync(file, "utf8"));

            // 协调器/作用域只消费通用 EnumResourceKind，不得自行固定 package 键；
            // 唯一固定点在 ResourceProvider 的 loadPackage 入口，避免绕过 Provider
            if (!file.endsWith("ResourceProvider.ts")) {
                expect(source).not.toMatch(/fairygui-package/);
            }
        }
    });

    test("locks fairygui-cc imports to the cocos adapter layer", () => {
        const cocosAdapterRoot = resolve(frameworkRoot, "adapters/cocos");
        const fairyGuiVendorRoot = resolve(frameworkVendorRoot, "fairygui");

        const offenders = collectTypeScriptFiles(frameworkRoot).filter((file) => {
            if (isWithin(file, cocosAdapterRoot)) {
                return false;
            }

            if (isWithin(file, frameworkVendorRoot)) {
                // vendor 目录（libs/fairygui）即 fairygui 本体，非框架源码
                return false;
            }

            const specifiers = extractModuleSpecifiers(readFileSync(file, "utf8"));
            const importsFairyGui = specifiers.some((specifier) => {
                if (specifier === "fairygui-cc" || specifier.startsWith("fairygui-cc/")) {
                    return true;
                }

                // 相对/别名路径直指 vendor 目录同样绕过白名单，一并锁定
                const target = resolveImportTarget(file, specifier);
                return target !== undefined && isWithin(target, fairyGuiVendorRoot);
            });

            return importsFairyGui;
        });

        expect(offenders).toEqual([]);
    });

    test("keeps the game layer free of fgui imports", () => {
        // 游戏层（assets/game 与 assets/game_*）作为外部消费者，不得导入 fgui：
        // 组合根经 adapter 边界接入 FairyGUI，游戏层只消费框架根入口的 UI 契约。
        const fairyGuiVendorRoot = resolve(frameworkVendorRoot, "fairygui");

        const offenders = collectTypeScriptFiles(assetsRoot).filter((file) => {
            if (!isGameLayerFile(file)) {
                return false;
            }

            const specifiers = extractModuleSpecifiers(readFileSync(file, "utf8"));
            return specifiers.some((specifier) => {
                if (specifier === "fairygui-cc" || specifier.startsWith("fairygui-cc/") || specifier === "fairygui" || specifier.startsWith("fairygui/")) {
                    return true;
                }

                // 相对/别名路径直指 vendor 目录同样绕过白名单，一并锁定
                const target = resolveImportTarget(file, specifier);
                return target !== undefined && isWithin(target, fairyGuiVendorRoot);
            });
        });

        expect(offenders).toEqual([]);
    });

    test("keeps the UI adapter modules importable only from within their own directory", () => {
        const uiAdapterRoot = resolve(frameworkRoot, "adapters/cocos/ui");

        const offenders = collectTypeScriptFiles(frameworkRoot).filter((file) => {
            if (isWithin(file, uiAdapterRoot)) {
                return false;
            }

            const specifiers = extractModuleSpecifiers(readFileSync(file, "utf8"));
            return specifiers.some((specifier) => {
                const target = resolveImportTarget(file, specifier);
                return target !== undefined && isWithin(target, uiAdapterRoot);
            });
        });

        // UI 根/页面适配器只经组合根（boot）接入，框架内部不得深层导入；
        // 目录内互相引用（CocosUiRoot ↔ FairyGuiPageAdapter）允许
        expect(offenders).toEqual([]);
    });

    test("keeps the resource core layer engine-agnostic", () => {
        const coreFiles = collectTypeScriptFiles(resolve(frameworkRoot, "core/resource"));
        expect(coreFiles.length).toBeGreaterThan(0);

        const coreSources = coreFiles.map((file) => stripComments(readFileSync(file, "utf8"))).join("\n");

        expect(coreSources).not.toMatch(/from\s*["']cc(?:["']|\/)/);
        expect(coreSources).not.toMatch(/\b(?:getInstance|singleton|ServiceLocator)\b/);
    });

    test.skipIf(!existsSync(resolve(frameworkRoot, "contracts/interfaces")))("keeps contracts/interfaces free of core implementations and Cocos", () => {
        const contractsInterfaceRoot = resolve(frameworkRoot, "contracts/interfaces");

        for (const file of collectTypeScriptFiles(contractsInterfaceRoot)) {
            const source = stripComments(readFileSync(file, "utf8"));
            // 契约层只放纯类型；实现细节在 core（对齐 ADR-013），契约层不得
            // 反向依赖 core 实现细节、不触达引擎与存储实现
            expect(source).not.toMatch(/from\s*["'][^"']*core\/(?:resource|ui|config|storage)\//);
            expect(source).not.toMatch(/from\s*["']cc(?:["']|\/)/);
            expect(source).not.toMatch(/from\s*["']fairygui(?:-cc)?(?:["']|\/)/);
            expect(source).not.toMatch(/from\s*["'][^"']*\/storage\//);
        }
    });

    test.skipIf(!existsSync(resolve(frameworkRoot, "core/config")))("keeps the config core layer engine-agnostic and separate from saves", () => {
        const coreConfigRoot = resolve(frameworkRoot, "core/config");

        const sources = collectTypeScriptFiles(coreConfigRoot)
            .map((file) => stripComments(readFileSync(file, "utf8")))
            .join("\n");

        expect(sources).not.toMatch(/from\s*["']cc(?:["']|\/)/);
        expect(sources).not.toMatch(/from\s*["']fairygui(?:-cc)?(?:["']|\/)/);
        // 配置走资源读取路径，内核不得依赖存档键值后端（core/contracts 同级 import 需显式拦截）
        expect(sources).not.toMatch(/from\s*["'][^"']*\/storage\//);
        expect(sources).not.toMatch(/\b(?:getInstance|singleton|ServiceLocator)\b/);
    });

    test.skipIf(!existsSync(resolve(frameworkRoot, "adapters/cocos/config")))("keeps the cocos config adapter on the resource path only", () => {
        const cocosConfigRoot = resolve(frameworkRoot, "adapters/cocos/config");

        for (const file of collectTypeScriptFiles(cocosConfigRoot)) {
            const source = stripComments(readFileSync(file, "utf8"));
            // 适配器允许 cc 导入，但不得触达存档后端，且不得依赖 FairyGUI
            expect(source).not.toMatch(/from\s*["'][^"']*\/storage\//);
            expect(source).not.toMatch(/from\s*["']fairygui(?:-cc)?(?:["']|\/)/);
        }
    });

    test("keeps the ui core layer engine-agnostic and free of service locators", () => {
        const coreUiRoot = resolve(frameworkRoot, "core/ui");
        if (!existsSync(coreUiRoot)) {
            return;
        }

        const sources = collectTypeScriptFiles(coreUiRoot)
            .map((file) => stripComments(readFileSync(file, "utf8")))
            .join("\n");

        expect(sources).not.toMatch(/from\s*["']cc(?:["']|\/)/);
        expect(sources).not.toMatch(/\b(?:getInstance|singleton|ServiceLocator|globalThis|window)\b/);
    });

    test("keeps platform, time and scheduling layers free of service locators and global singletons", () => {
        const newLayerRoots = [
            resolve(frameworkRoot, "contracts/interfaces"),
            resolve(frameworkRoot, "contracts/enums"),
            resolve(frameworkRoot, "contracts/constants"),
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
        expect(sources).not.toMatch(/\bstatic\s+(?:readonly\s+)?(?:instance|shared)\b/);
    });
});
