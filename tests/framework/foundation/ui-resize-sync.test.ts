import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

import { createFairyGuiMock } from "./helpers/fairygui-mock";
import {
    UI_LAYER_ORDER,
} from "../../../assets/framework/contracts/ui/Navigation";

// CocosUiRoot 与 FairyGuiPageAdapter 均经工厂间接依赖 fairygui-cc；测试不加载
// 真实运行时，统一使用共享 fixture（bun mock.module 全局共享首个生效）。
mock.module("fairygui-cc", () => createFairyGuiMock());

// ---- GRoot 接缝：尺寸可变且 setSize 记录调用 ----
interface GRootLike {
    readonly name: string;
    width: number;
    height: number;
    setSize(width: number, height: number): void;
    addChild(child: unknown): unknown;
    removeChild(child: unknown, dispose?: boolean): unknown;
    removeChildren(beginIndex?: number, endIndex?: number, dispose?: boolean): void;
    getChildAt(index: number): unknown;
    readonly numChildren: number;
}

interface ResizeContainer {
    name: string;
    width: number;
    height: number;
    setSize(width: number, height: number): void;
    addChild(child: unknown): unknown;
    removeChild(child: unknown, dispose?: boolean): unknown;
    removeChildren(beginIndex?: number, endIndex?: number, dispose?: boolean): void;
    getChildAt(index: number): unknown;
    readonly numChildren: number;
}

interface CocosUiRoot {
    readonly init: () => void;
    readonly initialized: boolean;
    readonly root: GRootLike | undefined;
    readonly onResize: (callback: (width: number, height: number) => void) => () => void;
    readonly dispose: () => void;
}

interface CocosUiRootOptions {
    readonly getRoot?: () => GRootLike;
    readonly subscribeResize?: (
        callback: (width: number, height: number) => void,
    ) => () => void;
}

interface CocosUiRootFactory {
    createCocosUiRoot(options?: CocosUiRootOptions): CocosUiRoot;
}

// ---- 0.5 目标契约：页面适配器随窗口尺寸同步层级容器 ----
interface FairyGuiViewLike {
    readonly name: string;
    dispose(): void;
}

interface FairyGuiPageAdapterOptions {
    readonly root: GRootLike;
    readonly createView?: (
        packageName: string,
        resName: string,
    ) => FairyGuiViewLike;
}

interface FairyGuiPageAdapter {
    init(): void;
    resize(width: number, height: number): void;
    setModal(modal: boolean): void;
    dispose(): void;
}

interface FairyGuiPageAdapterFactory {
    createFairyGuiPageAdapter(options: FairyGuiPageAdapterOptions): FairyGuiPageAdapter;
}

const projectRoot = resolve(import.meta.dir, "../../..");
const uiRootFile = resolve(
    projectRoot,
    "assets/framework/adapters/cocos/ui/CocosUiRoot.ts",
);
const adapterFile = resolve(
    projectRoot,
    "assets/framework/adapters/cocos/ui/FairyGuiPageAdapter.ts",
);

async function loadUiRootFactory(): Promise<CocosUiRootFactory> {
    const exports = (await import(pathToFileURL(uiRootFile).href)) as Partial<CocosUiRootFactory>;
    expect(typeof exports.createCocosUiRoot).toBe("function");
    return {
        createCocosUiRoot:
            exports.createCocosUiRoot as CocosUiRootFactory["createCocosUiRoot"],
    };
}

async function loadAdapterFactory(): Promise<FairyGuiPageAdapterFactory> {
    const exports = (await import(pathToFileURL(adapterFile).href)) as Partial<FairyGuiPageAdapterFactory>;
    expect(typeof exports.createFairyGuiPageAdapter).toBe("function");
    return {
        createFairyGuiPageAdapter:
            exports.createFairyGuiPageAdapter as FairyGuiPageAdapterFactory["createFairyGuiPageAdapter"],
    };
}

// ---- 记录型 root：尺寸可变，setSize 记录；addChild 建立记录型层级容器 ----
function createResizableRoot(): {
    readonly root: GRootLike;
    readonly containers: Map<string, ResizeContainer>;
    readonly setSizeCalls: Array<{ width: number; height: number }>;
} {
    const containers = new Map<string, ResizeContainer>();
    const setSizeCalls: Array<{ width: number; height: number }> = [];
    let width = 1280;
    let height = 720;

    function makeContainer(name: string): ResizeContainer {
        let containerWidth = 1280;
        let containerHeight = 720;
        const children: unknown[] = [];
        return {
            name,
            get width() {
                return containerWidth;
            },
            get height() {
                return containerHeight;
            },
            setSize(nextWidth: number, nextHeight: number) {
                containerWidth = nextWidth;
                containerHeight = nextHeight;
                setSizeCalls.push({ width: nextWidth, height: nextHeight });
            },
            addChild(child) {
                children.push(child);
                return child;
            },
            removeChild(child, _dispose = false) {
                const index = children.indexOf(child);
                if (index >= 0) {
                    children.splice(index, 1);
                }
                return child;
            },
            removeChildren(beginIndex = 0, endIndex?: number, _dispose = false) {
                children.splice(beginIndex, endIndex);
            },
            getChildAt(index) {
                return children[index];
            },
            get numChildren() {
                return children.length;
            },
        };
    }

    const root: GRootLike = {
        name: "GRoot",
        get width() {
            return width;
        },
        get height() {
            return height;
        },
        setSize(nextWidth: number, nextHeight: number) {
            width = nextWidth;
            height = nextHeight;
            setSizeCalls.push({ width: nextWidth, height: nextHeight });
        },
        addChild(child) {
            const name = (child as { name?: string } | undefined)?.name ?? "unknown";
            const container = makeContainer(name);
            containers.set(name, container);
            return container;
        },
        removeChild(child, _dispose = false) {
            return child;
        },
        removeChildren(_beginIndex = 0, _endIndex?: number, _dispose = false) { },
        getChildAt(_index: number) {
            return undefined;
        },
        get numChildren() {
            return 0;
        },
    };

    return { root, containers, setSizeCalls };
}

describe("window resize sync", () => {
    test("window resize syncs the UI root layout size and layer container sizes", async () => {
        const { createCocosUiRoot } = await loadUiRootFactory();
        const { createFairyGuiPageAdapter } = await loadAdapterFactory();

        let resizeCallback: ((width: number, height: number) => void) | undefined;
        const recording = createResizableRoot();
        const uiRoot = createCocosUiRoot({
            getRoot: () => recording.root,
            subscribeResize: (callback) => {
                resizeCallback = callback;
                return () => {
                    resizeCallback = undefined;
                };
            },
        });
        uiRoot.init();
        expect(uiRoot.initialized).toBe(true);
        expect(uiRoot.root).toBe(recording.root);

        const adapter = createFairyGuiPageAdapter({
            root: recording.root,
            createView: () => ({ name: "view", dispose: () => { } }),
        });
        adapter.init();

        // 模拟组合根桥接：UI 根尺寸变化 → 页面适配器同步层级容器
        const unsubscribe = uiRoot.onResize((width, height) => {
            adapter.resize(width, height);
        });

        expect(resizeCallback).toBeDefined();
        resizeCallback!(800, 600);

        // UI 根宿主同步根布局尺寸
        expect(recording.root.width).toBe(800);
        expect(recording.root.height).toBe(600);
        // 七层容器尺寸同步更新，不受残留旧尺寸影响
        for (const layer of UI_LAYER_ORDER) {
            const container = recording.containers.get(layer);
            expect(container).toBeDefined();
            expect(container?.width).toBe(800);
            expect(container?.height).toBe(600);
        }

        // onResize 退订后：根布局尺寸仍随窗口同步（根宿主职责），但适配器层级
        // 容器不再更新，保留上次同步尺寸
        unsubscribe();
        resizeCallback!(1000, 500);
        expect(recording.root.width).toBe(1000);
        expect(recording.root.height).toBe(500);
        for (const layer of UI_LAYER_ORDER) {
            expect(recording.containers.get(layer)?.width).toBe(800);
            expect(recording.containers.get(layer)?.height).toBe(600);
        }
    });

    test("a resize before initialization is a no-op", async () => {
        const { createCocosUiRoot } = await loadUiRootFactory();

        let resizeCallback: ((width: number, height: number) => void) | undefined;
        const recording = createResizableRoot();
        const _uiRoot = createCocosUiRoot({
            getRoot: () => recording.root,
            subscribeResize: (callback) => {
                resizeCallback = callback;
                return () => { };
            },
        });

        expect(resizeCallback).toBeDefined();
        resizeCallback!(800, 600);

        // 未初始化：不同步根布局尺寸
        expect(recording.root.width).toBe(1280);
        expect(recording.root.height).toBe(720);
        expect(recording.setSizeCalls).toHaveLength(0);
    });

    test("disposing the UI root stops syncing the layout size", async () => {
        const { createCocosUiRoot } = await loadUiRootFactory();

        let resizeCallback: ((width: number, height: number) => void) | undefined;
        const recording = createResizableRoot();
        const uiRoot = createCocosUiRoot({
            getRoot: () => recording.root,
            subscribeResize: (callback) => {
                resizeCallback = callback;
                return () => {
                    resizeCallback = undefined;
                };
            },
        });
        uiRoot.init();
        uiRoot.dispose();

        expect(resizeCallback).toBeUndefined();
    });

    test("the mask stays full-screen after a resize while modal is active", async () => {
        const { createCocosUiRoot } = await loadUiRootFactory();
        const { createFairyGuiPageAdapter } = await loadAdapterFactory();

        let resizeCallback: ((width: number, height: number) => void) | undefined;
        const recording = createResizableRoot();
        const uiRoot = createCocosUiRoot({
            getRoot: () => recording.root,
            subscribeResize: (callback) => {
                resizeCallback = callback;
                return () => { };
            },
        });
        uiRoot.init();

        const adapter = createFairyGuiPageAdapter({
            root: recording.root,
            createView: () => ({ name: "view", dispose: () => { } }),
        });
        adapter.init();
        adapter.setModal(true);

        const unsubscribe = uiRoot.onResize((width, height) => {
            adapter.resize(width, height);
        });

        resizeCallback!(800, 600);

        // 遮罩保持全屏覆盖新尺寸
        const system = recording.containers.get("system");
        expect(system?.numChildren).toBe(1);
        const mask = system?.getChildAt(0) as {
            width?: number;
            height?: number;
            setSize?: (width: number, height: number) => void;
        };
        expect(mask?.width).toBe(800);
        expect(mask?.height).toBe(600);

        unsubscribe();
    });
});
