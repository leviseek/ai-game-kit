import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

import { createFairyGuiMock } from "./helpers/fairygui-mock";

// AppRoot 经 createCocosUiRoot/createFairyGuiPageAdapter 工厂间接依赖 fairygui-cc；
// 测试不加载真实运行时，统一使用共享 fixture（bun mock.module 全局共享首个生效）。
mock.module("fairygui-cc", () => createFairyGuiMock());

// AppRoot 的 dev overlay 环境开关经 cc/env 的 DEBUG 宏注入；测试固定为 release
// （isDevEnabled=false），保证既有装配路径不创建 dev overlay（design D2）。
mock.module("cc/env", () => ({ DEBUG: false }));

// cc 接缝：AppRoot 依赖 director.addPersistRootNode，其余成员不在此路径触发。
mock.module("cc", () => ({
    game: {
        on() { },
        off() { },
    },
    director: {
        addPersistRootNode() { },
    },
    Game: {
        EVENT_HIDE: "game_hide",
        EVENT_SHOW: "game_show",
    },
    _decorator: {
        ccclass(_name: string) {
            return <TFunction extends (...args: unknown[]) => unknown>(target: TFunction): TFunction =>
                target;
        },
    },
    Component: class { },
    Node: class {
        static EventType: Record<string, string> = {};
    },
    EventTouch: class { },
    Touch: class { },
    Vec3: class { },
    profiler: { stats: null },
    sys: { isNative: false },
}));

interface AppRootInstance {
    onLoad(): void;
    start(): Promise<void>;
    onDestroy(): void;
    smoke?: SmokeProxyInstance;
    [key: string]: unknown;
}

interface SmokeProxyInstance {
    smokeUiInit(): boolean;
    smokeUiReady(): boolean;
    smokeUiLoadPackage(bundle: string, path: string): Promise<unknown>;
    smokeUiOpenPage(
        route: string,
        layer: string,
        packageName: string,
        resName: string,
    ): boolean;
    smokeUiClosePage(route: string): boolean;
    runUiSmoke(): Promise<void>;
    [key: string]: unknown;
}

const projectRoot = resolve(import.meta.dir, "../../..");
const appRootFile = resolve(projectRoot, "assets/boot/AppRoot.ts");

async function loadAppRoot(): Promise<{
    AppRoot: new () => AppRootInstance;
}> {
    const exports = (await import(pathToFileURL(appRootFile).href)) as {
        AppRoot?: new () => AppRootInstance;
    };
    expect(typeof exports.AppRoot).toBe("function");
    return { AppRoot: exports.AppRoot as new () => AppRootInstance };
}

describe("AppRoot FairyGUI UI smoke methods", () => {
    test("smokeUiReady is false before UI root initialization", async () => {
        const { AppRoot } = await loadAppRoot();
        const instance = new AppRoot();
        instance.onLoad();

        expect(instance.smoke?.smokeUiReady()).toBe(false);
    });

    test("smokeUiInit establishes the page adapter once the UI root is ready", async () => {
        const { AppRoot } = await loadAppRoot();

        const instance = new AppRoot();
        instance.onLoad();

        // 直接调用 smokeUiInit 时，真实 createCocosUiRoot 的缺省 GRoot seam 依赖引擎
        // GRoot 单例；此处仅验证方法存在性与幂等调用不抛错（运行时行为由 Web 冒烟验证）。
        expect(() => instance.smoke?.smokeUiInit()).not.toThrow();
        // 组合根不再手动 setModal：模态遮罩由适配器消费导航器状态自动同步
        expect(instance.smoke?.smokeUiSetModal).toBeUndefined();
    });

    test("smokeUiOpenPage/ClosePage are safe before the adapter is ready", async () => {
        const { AppRoot } = await loadAppRoot();
        const instance = new AppRoot();
        instance.onLoad();

        expect(
            instance.smoke?.smokeUiOpenPage("demo", "normal", "Demo", "DemoView"),
        ).toBe(false);
        expect(instance.smoke?.smokeUiClosePage("demo")).toBe(false);
    });

    test("smokeUiLoadPackage returns a failed handle under mock engine", async () => {
        const { AppRoot } = await loadAppRoot();
        const instance = new AppRoot();
        instance.onLoad();

        // SmokeProxy 依赖必填，uiHost 必然存在；此处验证的是 mock 引擎下
        // UiHost.loadPackage 加载失败返回 state === "failed"（非代理防御路径）
        const handle = await instance.smoke?.smokeUiLoadPackage("ui", "Demo/Demo");
        expect(handle).toBeDefined();
        const state = (handle as { state?: string }).state;
        expect(state).toBe("failed");
    });

    test("onDestroy disposes the page adapter and resource provider without throwing", async () => {
        const { AppRoot } = await loadAppRoot();
        const instance = new AppRoot();
        instance.onLoad();
        instance.onDestroy();
        instance.onDestroy();
    });

    test("runUiSmoke emits [ui-smoke] markers without throwing under mock engine", async () => {
        const { AppRoot } = await loadAppRoot();
        const instance = new AppRoot();
        instance.onLoad();

        const logs: string[] = [];
        const originalLog = console.log;
        console.log = (message?: unknown) => logs.push(String(message));

        try {
            await instance.smoke?.runUiSmoke();
        } finally {
            console.log = originalLog;
        }

        // mock 环境下 GRoot 就绪、adapter 建立，序列执行完整；真实加载路径
        // 因 cc.assetManager 缺失使 package 加载失败，但标记仍逐步输出
        const markers = logs.filter((line) => line.startsWith("[ui-smoke]"));
        expect(markers.length).toBeGreaterThanOrEqual(1);
        expect(markers.some((line) => line.includes("ui-root-init"))).toBe(true);
    });
});
