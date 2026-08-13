import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test, mock } from "bun:test";

import { FuiView } from "../../../assets/framework/contracts/ui/FuiView";
import type { FuiComponentUrl } from "../../../assets/framework/core/fui/FuiComponentRegistry";
import { getFuiComponentRegistry } from "../../../assets/framework/core/fui/FuiComponentRegistry";
import { FuiViewBindingRegistrationError, FuiViewCreationError } from "../../../assets/framework/core/fui/FuiErrors";
import { createCcMock } from "./helpers/cc-mock";
import { createFairyGuiMock } from "./helpers/fairygui-mock";

// cc mock 统一用共享 fixture（bun mock.module 全局共享首个生效）：本文件缺符号
// 的自定义桩会让全量运行中其它文件（如 dev-overlay-mount 的 viewport 装配）解析
// 失败，必须与 createCcMock 保持一致（含 view/screen/getSafeAreaRect）。
mock.module("cc", () => createCcMock());

// AppRoot 经 createCocosUiRoot 工厂间接依赖 fairygui-cc；测试不加载真实运行时，
// 统一使用共享 fixture（bun mock.module 全局共享首个生效，保证全量运行符号齐全）。
mock.module("fairygui-cc", () => createFairyGuiMock());

// AppRoot 的 dev overlay 环境开关经 cc/env 的 DEBUG 宏注入；测试固定为 release
// （isDevEnabled=false），保证既有装配路径不创建 dev overlay（design D2）。
mock.module("cc/env", () => ({ DEBUG: false }));

interface CocosComponent {
    onLoad(): void;
    start(): void;
    onDestroy(): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

interface ApplicationLike {
    readonly state: string;
    start(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    dispose(): Promise<void>;
}

interface AdapterLike {
    bind(): void;
    unbind(): void;
}

interface AppAssembly {
    readonly app: ApplicationLike;
    readonly adapter: AdapterLike;
    readonly sceneFlow?: {
        readonly state: string;
        preload(...args: unknown[]): Promise<unknown>;
        switchTo(...args: unknown[]): Promise<unknown>;
        dispose(): unknown;
    };
    readonly resourceProvider?: {
        canUnload(_bundle: string): boolean;
    };
    readonly uiHost?: {
        smokeUiInit(): boolean;
        readonly pageAdapter?: {
            createPage(route: string, layer: string, options?: { packageName?: string; resName?: string }): { readonly disposed: boolean; readonly error: unknown };
        };
    };
    readonly fuiViewBindingRegistrar?: object;
}

/** 测试覆盖对象创建的可选装配选项（对齐 assembleApp 的 FuiObjectFactory 接缝）。 */
interface AssemblyOptions {
    readonly fuiObjectFactory?: (packageName: string, resName: string) => unknown | null;
}

type AssembleAppFn = (options?: AssemblyOptions) => AppAssembly;

interface AssemblyExports {
    readonly assembleApp?: AssembleAppFn;
    readonly createModules?: () => readonly unknown[];
}

interface AppRootExports {
    readonly AppRoot?: new (...args: unknown[]) => CocosComponent;
}

const projectRoot = resolve(import.meta.dir, "../../..");
const assemblyFile = resolve(projectRoot, "assets/boot/assembly.ts");
const appRootFile = resolve(projectRoot, "assets/boot/AppRoot.ts");

async function loadAssembly(): Promise<{
    assembleApp: AssembleAppFn;
    createModules: () => readonly unknown[];
}> {
    const exports = (await import(pathToFileURL(assemblyFile).href)) as AssemblyExports;

    expect(typeof exports.assembleApp).toBe("function");

    return {
        assembleApp: exports.assembleApp as AssembleAppFn,
        createModules: (exports.createModules as () => readonly unknown[]) ?? (() => []),
    };
}

async function loadAppRoot(): Promise<{
    AppRoot: new (...args: unknown[]) => CocosComponent;
}> {
    const exports = (await import(pathToFileURL(appRootFile).href)) as AppRootExports;

    expect(typeof exports.AppRoot).toBe("function");

    return {
        AppRoot: exports.AppRoot as new (...args: unknown[]) => CocosComponent,
    };
}

describe("AppRoot Composition Root", () => {
    test("assembles an Application and Adapter", async () => {
        const { assembleApp } = await loadAssembly();

        const { app, adapter } = assembleApp();

        expect(app).toBeDefined();
        expect(adapter).toBeDefined();
        expect(typeof app.start).toBe("function");
        expect(typeof adapter.bind).toBe("function");
        expect(typeof adapter.unbind).toBe("function");
    });

    test("assembled Application starts in created state", async () => {
        const { assembleApp } = await loadAssembly();

        const { app } = assembleApp();

        expect(app.state).toBe("created");
    });

    test("assembled Application runs full lifecycle start → pause → resume → dispose", async () => {
        const { assembleApp } = await loadAssembly();

        const { app } = assembleApp();

        await app.start();
        expect(app.state).toBe("running");

        await app.pause();
        expect(app.state).toBe("paused");

        await app.resume();
        expect(app.state).toBe("running");

        await app.dispose();
        expect(app.state).toBe("disposed");
    });

    test("assembled Application can dispose directly from created state", async () => {
        const { assembleApp } = await loadAssembly();

        const { app } = assembleApp();

        await app.dispose();
        expect(app.state).toBe("disposed");
    });

    test("default module list is empty", async () => {
        const { createModules } = await loadAssembly();
        const modules = createModules();

        expect(Array.isArray(modules)).toBe(true);
        expect(modules).toHaveLength(0);
    });

    test("does not create forbidden system modules", async () => {
        const { createModules } = await loadAssembly();
        const modules = createModules();

        const moduleIds = new Set(modules.filter((m): m is { id?: string } => typeof m === "object" && m !== null).map((m) => m.id));

        const forbiddenIds = ["ui", "fairygui", "resource", "scene", "config", "network", "ecs", "battle", "combat", "time"];

        for (const id of forbiddenIds) {
            expect(moduleIds.has(id)).toBe(false);
        }
    });

    test("assembled scene flow exposes the smoke contract", async () => {
        const { assembleApp } = await loadAssembly();

        const { sceneFlow, resourceProvider } = assembleApp();

        expect(sceneFlow).toBeDefined();
        expect(typeof sceneFlow?.preload).toBe("function");
        expect(typeof sceneFlow?.switchTo).toBe("function");
        expect(typeof sceneFlow?.dispose).toBe("function");
        expect(sceneFlow?.state).toBe("idle");

        // 资源提供者提供释放观察入口，且初始无 Bundle 持有
        expect(typeof resourceProvider?.canUnload).toBe("function");
    });
});

describe("AppRoot Component", () => {
    test("is exported as a Cocos Component class", async () => {
        const { AppRoot } = await loadAppRoot();

        expect(typeof AppRoot).toBe("function");

        const instance = new AppRoot();

        expect(typeof instance.onLoad).toBe("function");
        expect(typeof instance.start).toBe("function");
        expect(typeof instance.onDestroy).toBe("function");
    });

    test("onLoad creates Application and Adapter via assembleApp", async () => {
        const { AppRoot } = await loadAppRoot();

        const instance = new AppRoot();

        instance.onLoad();

        // After onLoad, the internal app and adapter should be set
        // (we can't access private fields, but we can verify no error was thrown)
    });

    test("consumes the assembleApp-produced uiHost without re-assembling a host", () => {
        const source = readFileSync(appRootFile, "utf8");

        // 组合根单一装配：onLoad 直接消费 assembleApp 返回的已接线 uiHost
        // （this.uiHost = uiHost），不再在 onLoad 重复调用 createUiHost——
        // createUiHost 只属于 assembleApp（composition root 内部）
        expect(source).toMatch(/this\.uiHost = uiHost;/);
        expect(source).not.toMatch(/this\.uiHost = createUiHost\(/);
    });

    test("start calls adapter.bind and app.start without throwing", async () => {
        const { AppRoot } = await loadAppRoot();

        const instance = new AppRoot();
        instance.onLoad();

        await instance.start();
        // start() is async due to app.start(), but catches rejections internally
    });

    test("onDestroy calls adapter.unbind and app.dispose without throwing", async () => {
        const { AppRoot } = await loadAppRoot();

        const instance = new AppRoot();
        instance.onLoad();
        await instance.start();

        instance.onDestroy();
        // onDestroy() calls dispose() which returns Promise,
        // Component onDestroy does not need to return a promise
    });

    test("does not directly import Cocos hide/show event constants", () => {
        expect(existsSync(appRootFile)).toBe(true);

        const source = readFileSync(appRootFile, "utf8");

        expect(source).not.toMatch(/EVENT_HIDE/);
        expect(source).not.toMatch(/EVENT_SHOW/);
        expect(source).not.toMatch(/\bgame\s*\.\s*on\b/);
        expect(source).not.toMatch(/\bgame\s*\.\s*off\b/);
    });

    test("onDestroy calls unbind before dispose in source order", () => {
        expect(existsSync(appRootFile)).toBe(true);

        const source = readFileSync(appRootFile, "utf8");
        const onDestroyStart = source.indexOf("onDestroy()");
        const onDestroyBlock = source.slice(onDestroyStart);

        const unbindIndex = onDestroyBlock.indexOf("unbind()");
        const disposeIndex = onDestroyBlock.indexOf("dispose()");

        expect(unbindIndex).toBeGreaterThan(-1);
        expect(disposeIndex).toBeGreaterThan(-1);
        expect(unbindIndex).toBeLessThan(disposeIndex);
    });

    test("repeated onDestroy does not throw", async () => {
        const { AppRoot } = await loadAppRoot();

        const instance = new AppRoot();
        instance.onLoad();
        await instance.start();

        instance.onDestroy();

        instance.onDestroy();
        // Second onDestroy should be safe (adapter.off is idempotent, app.dispose is idempotent)
    });

    test("onDestroy before start does not throw", async () => {
        const { AppRoot } = await loadAppRoot();

        const instance = new AppRoot();
        instance.onLoad();

        instance.onDestroy();
        // unbind/dispose called without bind/start — optional chaining handles undefined
    });

    test("full lifecycle then double onDestroy does not throw", async () => {
        const { AppRoot } = await loadAppRoot();

        const instance = new AppRoot();
        instance.onLoad();
        await instance.start();

        instance.onDestroy();
        instance.onDestroy();
        // After first onDestroy, app is disposed; second call is no-op via Application guard
    });

    test("exposes smoke trigger and observation methods after onLoad", async () => {
        const { AppRoot } = await loadAppRoot();

        const instance = new AppRoot();
        instance.onLoad();

        const smoke = (instance as unknown as { smoke?: Record<string, unknown> }).smoke;
        expect(typeof smoke?.smokePreload).toBe("function");
        expect(typeof smoke?.smokeSwitchTo).toBe("function");
        expect(typeof smoke?.smokeCanUnload).toBe("function");
    });

    test("exposes FairyGUI UI smoke methods after onLoad", async () => {
        const { AppRoot } = await loadAppRoot();

        const instance = new AppRoot();
        instance.onLoad();

        const smoke = (instance as unknown as { smoke?: Record<string, unknown> }).smoke;
        expect(typeof smoke?.smokeUiInit).toBe("function");
        expect(typeof smoke?.smokeUiReady).toBe("function");
        expect(typeof smoke?.smokeUiLoadPackage).toBe("function");
        expect(typeof smoke?.smokeUiOpenPage).toBe("function");
        expect(typeof smoke?.smokeUiClosePage).toBe("function");
        // 组合根不再暴露手动 setModal：遮罩由适配器消费导航器模态状态自动同步
        expect((smoke as { smokeUiSetModal?: unknown } | undefined)?.smokeUiSetModal).toBeUndefined();
    });

    test("exposes the scene flow smoke method as a thin proxy", async () => {
        const { AppRoot } = await loadAppRoot();

        const instance = new AppRoot();
        instance.onLoad();

        const smoke = (instance as unknown as { smoke?: Record<string, unknown> }).smoke;
        expect(typeof smoke?.runSceneFlowSmoke).toBe("function");
    });

    test("smoke methods live in SmokeProxy, not directly on AppRoot", () => {
        const source = readFileSync(appRootFile, "utf8");

        // 冒烟职责收敛到 SmokeProxy；AppRoot 只经 createSmokeProxy 初始化，
        // 若未来有人把冒烟方法放回 AppRoot（回退重构），此断言拦截
        expect(source).toMatch(/createSmokeProxy/);
        expect(source).not.toMatch(/^\s*smokePreload\(/m);
        expect(source).not.toMatch(/^\s*smokeUiInit\(/m);
        expect(source).not.toMatch(/^\s*runUiSmoke\(/m);
    });

    test("delegates default startup orchestration to BootFlow", () => {
        expect(existsSync(appRootFile)).toBe(true);

        const source = readFileSync(appRootFile, "utf8");

        // 组合根装配 BootFlow 并委托启动编排（logo → 热更 → 预加载 → 分派）
        expect(source).toMatch(/createBootFlow/);
        expect(source).toMatch(/\.launch\(\)/);
    });

    test("default startup defers UI root init to game first presentation", () => {
        const source = readFileSync(appRootFile, "utf8");

        // 默认流程不再在 startup 初始化 GRoot：AppRoot 无 initializeUiRoot 直接调用，
        // GRoot 初始化由 BootFlow 推迟到 game 首次呈现；随后经 onGameSceneActive 从
        // 注册桥装配 game 模块列表流（openListPageWithRetry 在 game bundle 内实现）
        expect(source).not.toMatch(/initializeUiRoot/);
        expect(source).toMatch(/onGameSceneActive/);
        expect(source).toMatch(/createListFlow/);
    });

    test("dev overlay 装配外移到 dev 模块（AppRoot 薄转发）", () => {
        const source = readFileSync(appRootFile, "utf8");

        // 对齐 SmokeProxy 外移先例：dev overlay 的组装（loadPackage/采样器/时钟/重试）
        // 收敛到 boot/dev，AppRoot 只经 setupDevOverlay 薄转发，不再内联 mount 细节
        expect(source).toMatch(/setupDevOverlayIfEnabled/);
        expect(source).toMatch(/setupDevOverlay\(/);
        expect(source).not.toMatch(/mountDevOverlay\(/);
        expect(source).not.toMatch(/createDevInfoSampler/);
        expect(source).not.toMatch(/createCocosDeviceInfo/);
    });
});

describe("AppRoot lobby host", () => {
    test("exposes GameLobbyHost methods as thin proxies", async () => {
        const { AppRoot } = await loadAppRoot();

        const instance = new AppRoot();
        instance.onLoad();

        expect(typeof instance.openEntryPage).toBe("function");
        expect(typeof instance.closeEntryPage).toBe("function");
    });

    test("openEntryPage is safe before the page adapter is ready", async () => {
        const { AppRoot } = await loadAppRoot();

        const instance = new AppRoot();
        instance.onLoad();

        await expect(
            instance.openEntryPage({
                route: "card/battle",
                packageName: "CardGame",
                resName: "CardBattleView",
            }),
        ).rejects.toThrow(/page adapter not ready/);
    });

    test("closeEntryPage is idempotent before any entry page is open", async () => {
        const { AppRoot } = await loadAppRoot();

        const instance = new AppRoot();
        instance.onLoad();

        await expect(instance.closeEntryPage({} as unknown as { node(): unknown; onClose(): void })).resolves.toBeUndefined();
        await expect(instance.closeEntryPage({} as unknown as { node(): unknown; onClose(): void })).resolves.toBeUndefined();
    });
});

describe("AppRoot FuiView binder 接线", () => {
    /** required 组件视图：fields/clicks 为空，仅触发 runtime binding 装配路径。 */
    class RequiredView extends FuiView<unknown, unknown> {
        protected onConstruct(): void {}
        protected onState(_vm: unknown): void {}
    }

    const LOGIN_VIEW_URL = ("ui" + "://Login/LoginView") as FuiComponentUrl;

    test("assembleApp 产出已接线 UiHost：required 页面无 binder 时 disposed 且 typed missing-binder", async () => {
        const { assembleApp } = await loadAssembly();

        // 隔离全局组件注册表：保存原单例，用例结束后恢复（禁止无条件 delete，
        // 否则会删掉已由其它缓存 ESM 模块登记的组件元数据，破坏其它用例）
        const g = globalThis as Record<string, unknown>;
        const original = g["__ai_game_kit_fui_components__"];
        if (original === undefined) {
            delete g["__ai_game_kit_fui_components__"];
        }
        try {
            const registry = getFuiComponentRegistry();
            registry.register(LOGIN_VIEW_URL, {
                ctor: RequiredView,
                fields: {},
                clicks: [],
                runtimeBinding: "required",
            });

            // 测试接缝：覆盖对象创建（生产无参调用使用 UIPackage.createObject）
            const componentMock = {
                name: "LoginView",
                disposed: 0,
                dispose() {
                    this.disposed++;
                },
            };
            const assembly = assembleApp({
                fuiObjectFactory: () => componentMock,
            });

            // 初始化 UI 根宿主并建立页面适配器（默认 GRoot mock 可创建）
            expect(assembly.uiHost?.smokeUiInit()).toBe(true);

            // 未注册 binder 的 required 页面：创建失败 → page.disposed，error 为 typed missing-binder
            const page = assembly.uiHost?.pageAdapter?.createPage("login", "normal", {
                packageName: "Login",
                resName: "LoginView",
            });
            expect(page?.disposed).toBe(true);
            const error = page?.error;
            expect(error).toBeInstanceOf(FuiViewCreationError);
            const cause = (error as FuiViewCreationError).cause;
            expect(cause).toBeInstanceOf(FuiViewBindingRegistrationError);
            expect((cause as Error).message).toMatch(/runtime binding missing/);
            // 回滚：测试接缝创建的组件对象被释放
            expect(componentMock.disposed).toBe(1);
        } finally {
            if (original === undefined) {
                delete g["__ai_game_kit_fui_components__"];
            } else {
                g["__ai_game_kit_fui_components__"] = original;
            }
        }
    });

    test("两次 assembleApp 的 fuiViewBindingRegistrar 实例隔离", async () => {
        const { assembleApp } = await loadAssembly();

        const first = assembleApp();
        const second = assembleApp();

        expect(first.fuiViewBindingRegistrar).toBeDefined();
        expect(second.fuiViewBindingRegistrar).toBeDefined();
        expect(first.fuiViewBindingRegistrar).not.toBe(second.fuiViewBindingRegistrar);
    });
});

describe("startup.scene", () => {
    const sceneFile = resolve(projectRoot, "assets/boot/startup.scene");

    test("exists and is valid JSON", () => {
        expect(existsSync(sceneFile)).toBe(true);

        const content = readFileSync(sceneFile, "utf8");
        const scene = JSON.parse(content);

        expect(Array.isArray(scene)).toBe(true);
        expect(scene.length).toBeGreaterThan(0);
    });

    test("contains an AppRoot node with AppRoot component", () => {
        const content = readFileSync(sceneFile, "utf8");
        const scene = JSON.parse(content) as Array<{ _name?: string; __type__?: string; _components?: Array<{ __id__: number }> }>;

        const appRootNode = scene.find((entry) => entry._name === "AppRoot" && entry.__type__ === "cc.Node");

        expect(appRootNode).toBeDefined();

        const componentIds = appRootNode?._components?.map((c) => c.__id__) ?? [];
        expect(componentIds.length).toBe(1);

        const componentId = componentIds[0];
        expect(componentId).toBeDefined();

        const component = scene[componentId as number];
        expect(component).toBeDefined();

        if (component !== undefined) {
            const componentType = component.__type__ as string;
            expect(componentType).toMatch(/^fa179/);
        }
    });

    test("AppRoot node is a child of the Scene", () => {
        const content = readFileSync(sceneFile, "utf8");
        const scene = JSON.parse(content) as Array<{ _name?: string; __type__?: string; _children?: Array<{ __id__: number }> }>;

        const sceneEntry = scene.find((entry) => entry.__type__ === "cc.Scene");

        expect(sceneEntry).toBeDefined();

        const childIds = sceneEntry?._children?.map((c) => c.__id__) ?? [];
        const appRootIndex = scene.findIndex((e) => e._name === "AppRoot" && e.__type__ === "cc.Node");

        expect(childIds).toContain(appRootIndex);
    });

    test("AppRoot node does not have Canvas/UI/Camera children", () => {
        const content = readFileSync(sceneFile, "utf8");
        const scene = JSON.parse(content) as Array<{ _name?: string; __type__?: string; _components?: Array<{ __id__: number }> }>;

        const appRootNode = scene.find((entry) => entry._name === "AppRoot" && entry.__type__ === "cc.Node");

        expect(appRootNode).toBeDefined();

        const componentIds = appRootNode?._components?.map((c) => c.__id__) ?? [];

        for (const compId of componentIds) {
            const comp = scene[compId];
            if (comp !== undefined) {
                const type = comp.__type__ as string;
                expect(type).not.toMatch(/^(cc\.)?(Canvas|Camera|UITransform|Widget|Sprite|Label|Button)/);
            }
        }
    });
});

describe("game.scene (smoke switch target)", () => {
    const gameSceneFile = resolve(projectRoot, "assets/game/game.scene");

    test("exists and is valid JSON", () => {
        expect(existsSync(gameSceneFile)).toBe(true);

        const content = readFileSync(gameSceneFile, "utf8");
        const scene = JSON.parse(content);

        expect(Array.isArray(scene)).toBe(true);
        expect(scene.length).toBeGreaterThan(0);
    });

    test("scene asset name matches the director.loadScene target", () => {
        const content = readFileSync(gameSceneFile, "utf8");
        const scene = JSON.parse(content) as Array<{ _name?: string; __type__?: string }>;

        const sceneAsset = scene.find((entry) => entry.__type__ === "cc.SceneAsset");
        expect(sceneAsset).toBeDefined();

        // cc.director.loadScene 按场景文件名（不含扩展名）解析，冒烟 sceneId 用 "game"
        expect(sceneAsset?._name).toBe("game");
    });

    test("contains only infrastructure components (no business UI)", () => {
        const content = readFileSync(gameSceneFile, "utf8");
        // JSON.parse 仅用于校验场景文件可解析；后续断言直接在原始文本上做正则匹配
        const _scene = JSON.parse(content) as Array<{ __type__?: string }>;

        const forbiddenUI = ["cc.Sprite", "cc.Label", "cc.Button", "cc.RichText", "cc.EditBox", "cc.Layout", "cc.ScrollView", "cc.ProgressBar", "cc.Slider", "cc.Toggle", "cc.Mask", "cc.Graphics"];

        for (const component of forbiddenUI) {
            expect(content).not.toMatch(new RegExp(`"__type__"\\s*:\\s*"${component.replace(".", "\\.")}"`));
        }
    });
});
