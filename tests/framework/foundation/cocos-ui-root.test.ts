import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

import { createFairyGuiMock } from "./helpers/fairygui-mock";

// 实现文件 import "fairygui-cc"，测试不加载真实运行时，只注入 GRoot 接缝。
// bun 的 mock.module 全局共享且首个注册生效，与 cocos-adapter 对 "cc" 的处理一致；
// 统一使用共享 fixture 保证全量运行下其它文件值导入的符号齐全。
mock.module("fairygui-cc", () => createFairyGuiMock());

interface GRootLike {
    readonly name: string;
    readonly width: number;
    readonly height: number;
    setSize(width: number, height: number): void;
    addChild(child: unknown): unknown;
    removeChild(child: unknown, dispose?: boolean): unknown;
    removeChildren(beginIndex?: number, endIndex?: number, dispose?: boolean): void;
    getChildAt(index: number): unknown;
    readonly numChildren: number;
}

interface CocosUiRootOptions {
    /** GRoot 获取接缝；缺省使用引擎 GRoot 单例，测试可注入 mock。 */
    readonly getRoot?: () => GRootLike;
    /** 窗口尺寸变化订阅接缝；缺省订阅真实 window resize，测试可注入受控触发源。 */
    readonly subscribeResize?: (
        callback: (width: number, height: number) => void,
    ) => () => void;
}

interface CocosUiRoot {
    /** 初始化入口：获取 GRoot 并进入可用状态；重复调用幂等。 */
    readonly init: () => void;
    /** 是否已初始化。 */
    readonly initialized: boolean;
    /** 已初始化的 GRoot；未初始化时为 undefined。 */
    readonly root: GRootLike | undefined;
    /** 注册根尺寸同步监听（窗口 resize 且根尺寸已更新后回调），返回退订。 */
    readonly onResize: (
        callback: (width: number, height: number) => void,
    ) => () => void;
    /** 释放：退订窗口尺寸监听；幂等。 */
    readonly dispose: () => void;
}

interface CocosUiRootFactory {
    createCocosUiRoot(options?: CocosUiRootOptions): CocosUiRoot;
}

const projectRoot = resolve(import.meta.dir, "../../..");
const adapterFile = resolve(
    projectRoot,
    "assets/framework/adapters/cocos/ui/CocosUiRoot.ts",
);

async function loadFactory(): Promise<CocosUiRootFactory> {
    const exports = (await import(
        pathToFileURL(adapterFile).href
    )) as Partial<CocosUiRootFactory>;

    expect(typeof exports.createCocosUiRoot).toBe("function");

    return {
        createCocosUiRoot:
            exports.createCocosUiRoot as CocosUiRootFactory["createCocosUiRoot"],
    };
}

interface GRootSeam {
    readonly root: GRootLike;
    readonly calls: number;
    readonly getRoot: () => GRootLike;
    /** 捕获 subscribeResize 注册的回调；退订后置 undefined。 */
    resizeCallback: ((width: number, height: number) => void) | undefined;
    readonly setSizeCalls: Array<{ width: number; height: number }>;
    readonly subscribeResize: (
        callback: (width: number, height: number) => void,
    ) => () => void;
}

function createGRootSeam(): GRootSeam {
    let calls = 0;
    let width = 1280;
    let height = 720;
    let resizeCallback: ((width: number, height: number) => void) | undefined;
    const setSizeCalls: Array<{ width: number; height: number }> = [];
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
        addChild: () => undefined,
        removeChild: () => undefined,
        removeChildren: () => { },
        getChildAt: () => undefined,
        numChildren: 0,
    };

    return {
        root,
        get calls() {
            return calls;
        },
        getRoot: mock(() => {
            calls += 1;
            return root;
        }),
        get resizeCallback() {
            return resizeCallback;
        },
        set resizeCallback(callback) {
            resizeCallback = callback;
        },
        setSizeCalls,
        subscribeResize: (callback) => {
            resizeCallback = callback;
            return () => {
                resizeCallback = undefined;
            };
        },
    };
}

describe("CocosUiRoot", () => {
    test("initializes the UI root through the adapter factory", async () => {
        const { createCocosUiRoot } = await loadFactory();
        const seam = createGRootSeam();
        const uiRoot = createCocosUiRoot({ getRoot: seam.getRoot });

        expect(uiRoot.initialized).toBe(false);
        expect(uiRoot.root).toBeUndefined();

        uiRoot.init();

        expect(seam.getRoot).toHaveBeenCalledTimes(1);
        expect(uiRoot.initialized).toBe(true);
        expect(uiRoot.root).toBe(seam.root);
    });

    test("repeated initialization is idempotent and reuses the same root", async () => {
        const { createCocosUiRoot } = await loadFactory();
        const seam = createGRootSeam();
        const uiRoot = createCocosUiRoot({ getRoot: seam.getRoot });

        uiRoot.init();
        uiRoot.init();

        // 第二次 init 不重新获取 GRoot，不产生重复根节点或重复注册
        expect(seam.getRoot).toHaveBeenCalledTimes(1);
        expect(uiRoot.initialized).toBe(true);
        expect(uiRoot.root).toBe(seam.root);
    });

    test("initialization failure is reported and leaves the root uninitialized", async () => {
        const { createCocosUiRoot } = await loadFactory();
        const original = new Error("GRoot not available yet");

        const uiRoot = createCocosUiRoot({
            getRoot: () => {
                throw original;
            },
        });

        expect(() => uiRoot.init()).toThrow(original);
        expect(uiRoot.initialized).toBe(false);
        expect(uiRoot.root).toBeUndefined();
    });

    test("a failed initialization can be retried and then succeed", async () => {
        const { createCocosUiRoot } = await loadFactory();
        const original = new Error("engine not ready");
        let attempts = 0;
        const seam = createGRootSeam();

        const uiRoot = createCocosUiRoot({
            getRoot: () => {
                attempts += 1;
                if (attempts === 1) {
                    throw original;
                }
                return seam.root;
            },
        });

        expect(() => uiRoot.init()).toThrow(original);
        expect(uiRoot.initialized).toBe(false);

        uiRoot.init();

        expect(uiRoot.initialized).toBe(true);
        expect(uiRoot.root).toBe(seam.root);
    });

    test("a seam that returns undefined counts as not ready and reports failure", async () => {
        const { createCocosUiRoot } = await loadFactory();

        const uiRoot = createCocosUiRoot({
            getRoot: () => undefined,
        });

        expect(() => uiRoot.init()).toThrow(/GRoot is not available/);
        expect(uiRoot.initialized).toBe(false);
        expect(uiRoot.root).toBeUndefined();
    });

    test("defaults to the engine GRoot singleton when no seam is injected", async () => {
        const { createCocosUiRoot } = await loadFactory();

        expect(typeof createCocosUiRoot().init).toBe("function");

        // bun 的 mock.module("fairygui-cc") 无法可靠地在全量运行下观察缺省路径，
        // 改用源码断言锁定"未注入时读取引擎 GRoot 单例"（与 cocos-scene-adapter 一致）。
        const source = readFileSync(adapterFile, "utf8");
        expect(source).toMatch(/GRoot\.(?:inst|create)/);
        expect(source).toMatch(/options\.getRoot\s*\?\?/);
        expect(source).toMatch(/options\.subscribeResize\s*\?\?/);
    });

    test("subscribes to window resize and syncs the root layout size", async () => {
        const { createCocosUiRoot } = await loadFactory();
        const seam = createGRootSeam();
        const uiRoot = createCocosUiRoot({
            getRoot: seam.getRoot,
            subscribeResize: seam.subscribeResize,
        });

        // 订阅在根宿主创建时建立
        expect(seam.resizeCallback).toBeDefined();

        uiRoot.init();
        seam.resizeCallback?.(800, 600);

        expect(seam.root.width).toBe(800);
        expect(seam.root.height).toBe(600);
        expect(seam.setSizeCalls).toEqual([{ width: 800, height: 600 }]);
    });

    test("a resize before initialization is a no-op", async () => {
        const { createCocosUiRoot } = await loadFactory();
        const seam = createGRootSeam();
        const uiRoot = createCocosUiRoot({
            getRoot: seam.getRoot,
            subscribeResize: seam.subscribeResize,
        });

        seam.resizeCallback?.(800, 600);

        expect(uiRoot.initialized).toBe(false);
        expect(seam.root.width).toBe(1280);
        expect(seam.root.height).toBe(720);
        expect(seam.setSizeCalls).toHaveLength(0);
    });

    test("dispose unsubscribes the window resize listener", async () => {
        const { createCocosUiRoot } = await loadFactory();
        const seam = createGRootSeam();
        const uiRoot = createCocosUiRoot({
            getRoot: seam.getRoot,
            subscribeResize: seam.subscribeResize,
        });

        uiRoot.init();
        uiRoot.dispose();

        expect(seam.resizeCallback).toBeUndefined();
    });

    test("onResize notifies listeners after the root size is synced", async () => {
        const { createCocosUiRoot } = await loadFactory();
        const seam = createGRootSeam();
        const uiRoot = createCocosUiRoot({
            getRoot: seam.getRoot,
            subscribeResize: seam.subscribeResize,
        });
        uiRoot.init();

        const seen: Array<{ width: number; height: number }> = [];
        const unsubscribe = uiRoot.onResize((width, height) => {
            seen.push({ width, height });
        });

        seam.resizeCallback?.(800, 600);
        expect(seen).toEqual([{ width: 800, height: 600 }]);

        // 退订后监听者不再收到；根尺寸仍随窗口同步（根宿主职责）
        unsubscribe();
        seam.resizeCallback?.(1000, 500);
        expect(seen).toEqual([{ width: 800, height: 600 }]);
        expect(seam.root.width).toBe(1000);
    });
});
