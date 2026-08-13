import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

import type { IResourceProvider } from "../../../assets/framework";
import { FuiViewCleanupError } from "../../../assets/framework/core/fui/FuiErrors";
import { createFairyGuiMock } from "./helpers/fairygui-mock";
import { createMemoryResourceProvider } from "../../../assets/framework/adapters/memory/MemoryResourceProvider";
import { MemoryLogger } from "../support/MemoryLogger";

// UiHost 值导入 fairygui-cc（页面适配器边界），统一使用共享 fixture；
// 经动态导入加载，保证 mock.module 先于模块图注册（与 cocos-ui-root 等一致）
mock.module("fairygui-cc", () => createFairyGuiMock());

const projectRoot = resolve(import.meta.dir, "../../..");
const lobbyHostFile = resolve(projectRoot, "assets/boot/host/GameLobbyHostImpl.ts");
const bootConstantsFile = resolve(projectRoot, "assets/boot/constants.ts");

describe("GameLobbyHostImpl source contract", () => {
    test("loads the shared ui dependency Common before opening any package page", () => {
        expect(existsSync(lobbyHostFile)).toBe(true);
        expect(existsSync(bootConstantsFile)).toBe(true);

        const source = readFileSync(lobbyHostFile, "utf8");
        const bootConstants = readFileSync(bootConstantsFile, "utf8");

        // Demo/CardGame 跨包引用通用资源包 Common（按钮/进度条组件）；fgui
        // loadPackage 不自动加载依赖包，若 Common 未先注册则组件退化为空、点击
        // 不触发。契约要求 ensureSharedUiDependencies（加载 Common）先于入口页
        // /全局页 package 加载。字符串归口：宿主引用常量而非裸写（boot 侧
        // constants.ts 锁定 "Common/Common" 契约值）。
        expect(source).toMatch(/ensureSharedUiDependencies/);
        expect(source).toMatch(/PACKAGE_PATHS\.common/);
        expect(bootConstants).toMatch(/"Common\/Common"/);

        // 调用点顺序：openEntryPage 与 openGlobalPage 内部都先调依赖再加载目标包，
        // 保证"依赖先注册"语义（源码顺序 = 执行顺序的强契约）
        const ensureCall = source.indexOf("ensureSharedUiDependencies()");
        expect(ensureCall).toBeGreaterThan(-1);

        // 入口页与全局页共用通用包加载路径（`${entry.packageName}/...`），各一次
        const pkgLoads = [...source.matchAll(/const pkgPath = `\$\{entry\.packageName\}/g)].map((match) => match.index ?? -1);
        expect(pkgLoads.length).toBe(2);
        for (const index of pkgLoads) {
            expect(index).toBeGreaterThan(ensureCall);
        }
    });

    test("exposes host primitives openGlobalPage / ensureUiReady / loadBundle", () => {
        const source = readFileSync(lobbyHostFile, "utf8");

        // 列表页编排已迁至 game bundle（lobby/list.ts），宿主只保留原语能力：
        // 全局页打开、UI 就绪查询与 Bundle 加载（哨兵资源触发脚本执行）
        expect(source).toMatch(/openGlobalPage/);
        expect(source).toMatch(/ensureUiReady/);
        expect(source).toMatch(/loadBundle/);
        // 哨兵资源映射：game 用同名场景资源（无 placeholder.json），其余 bundle 用
        // placeholder；loadBundle 不再恒加载 placeholder，经 bundleSentinel 分派
        // （字符串归口：经 BUNDLES/SENTINELS 常量引用，值锁定于 boot constants.ts）
        expect(source).toMatch(/bundleSentinel\(bundle\)/);
        expect(source).toMatch(/resourceProvider\.load\(\s*bundle,\s*this\.bundleSentinel\(bundle\)\s*,\s*\)/);
        expect(source).toMatch(/return bundle === BUNDLES\.game \? BUNDLES\.game : SENTINELS\.placeholder;/);
        // 列表编排不再残留在宿主
        expect(source).not.toMatch(/openListPageWithRetry/);
        expect(source).not.toMatch(/gameTypeCatalog/);
    });
});

describe("GameLobbyHostImpl session resource scope (release loop)", () => {
    test("exiting a genre releases its session scope while the list package stays resident", async () => {
        // GameLobbyHostImpl.openEntryPage 建会话 scope 持有品类包、closeEntryPage 释放
        // （ADR-020 决策 3）；openEntryPage 成功路径依赖页面适配器（真实 fgui），此处以
        // 内存 provider + 真实 UiHost 验证该会话 scope 释放闭环：品类包 bundle 卸载触发、
        // 列表包（全局 uiScope 常驻）不受影响。品类包与列表包按 bundle 隔离使 canUnload
        // 可观察（对齐设计预加载分层 L2 会话 / L0 常驻）。
        const uiHostModule = (await import(pathToFileURL(resolve(projectRoot, "assets/boot/host/UiHost.ts")).href)) as {
            createUiHost: (deps: { uiRoot: unknown; resourceProvider: IResourceProvider; logger: MemoryLogger }) => {
                loadPackage: (bundle: string, path: string) => Promise<{ state: string }>;
                canUnload: (bundle: string) => boolean;
                release: () => void;
            };
        };
        const createUiHost = uiHostModule.createUiHost;

        const unloaded: string[] = [];
        const provider = createMemoryResourceProvider({
            unloadBundle: (bundle: string) => {
                unloaded.push(bundle);
            },
        });
        const host = createUiHost({
            uiRoot: {
                getRoot: () => undefined,
                subscribeResize: () => () => {},
            },
            resourceProvider: provider,
            logger: new MemoryLogger(),
        });

        // 列表页经全局 uiScope 常驻：GameLobbyHostImpl.openGlobalPage 走 host.loadPackage
        const listHandle = await host.loadPackage("ui", "Demo/Demo");
        expect(listHandle.state).toBe("ready");
        expect(provider.canUnload("ui")).toBe(false);

        // 品类包走会话作用域：会话 scope 独立持有品类包（对齐 openEntryPage 语义）
        const sessionScope = provider.createScope();
        const genreHandle = provider.loadPackage("cardgame", "CardGame/CardGame");
        sessionScope.retain(genreHandle);
        await genreHandle.done;
        expect(provider.canUnload("cardgame")).toBe(false);
        expect(provider.canUnload("ui")).toBe(false);

        // 退出品类（closeEntryPage 释放会话 scope）：品类包引用归零、Bundle 卸载触发；
        // 列表包仍由全局 uiScope 持有，不受会话退出影响
        sessionScope.release();
        expect(provider.canUnload("cardgame")).toBe(true);
        expect(unloaded).toContain("cardgame");
        expect(provider.canUnload("ui")).toBe(false);
        expect(unloaded).not.toContain("ui");
    });
});

// ---- 清理失败隔离（task 3）：结构化的 GRoot 接缝 mock，供 UiHost 建立页面适配器 ----
interface TestUiHostLike {
    ensurePageAdapter(): boolean;
    loadPackage(bundle: string, path: string): Promise<{ state: string }>;
    canUnload(bundle: string): boolean;
    dispose(): void;
    readonly pageAdapter:
        | {
              dispose(): void;
              destroy(page: unknown): void;
              createPage(route: string, layer: string, options?: { packageName?: string; resName?: string }): unknown;
          }
        | undefined;
    readonly navigator:
        | {
              open(route: string, options?: { layer?: string; blocking?: boolean }): { ok: boolean };
              readonly top: { id: string } | undefined;
              close(...args: unknown[]): unknown;
              dispose(): void;
          }
        | undefined;
}

interface TestLobbyHostLike {
    closeEntryPage(_handle: unknown): Promise<void>;
    dispose(): void;
}

// 容器接缝：对齐 GRootLike 形状（addChild 返回可持有的容器），使页面适配器
// init 建立七层容器可被容器级调用消费
function makeRootLike(): unknown {
    const children: unknown[] = [];
    return {
        name: "GRoot",
        width: 1280,
        height: 720,
        setSize(_width: number, _height: number) {},
        addChild(child: unknown) {
            children.push(child);
            const name = (child as { name?: string } | undefined)?.name ?? "container";
            const containerChildren: unknown[] = [];
            return {
                name,
                width: 1280,
                height: 720,
                addChild(c: unknown) {
                    containerChildren.push(c);
                    return c;
                },
                removeChild(c: unknown, _dispose = false) {
                    const index = containerChildren.indexOf(c);
                    if (index >= 0) containerChildren.splice(index, 1);
                    return c;
                },
                removeChildren() {
                    containerChildren.length = 0;
                },
                getChildAt(index: number) {
                    return containerChildren[index];
                },
                get numChildren() {
                    return containerChildren.length;
                },
            };
        },
        removeChild(child: unknown) {
            const index = children.indexOf(child);
            if (index >= 0) children.splice(index, 1);
            return child;
        },
        removeChildren() {
            children.length = 0;
        },
        getChildAt(index: number) {
            return children[index];
        },
        get numChildren() {
            return children.length;
        },
    };
}

// uiRoot 接缝：对齐 CocosUiRoot 形状（root/init/onResize/dispose），onResize
// 可注入受控退订（UiHost 在 ensurePageAdapter 建立 resize 订阅）
function makeUiRoot(onResize?: () => () => void): unknown {
    return {
        initialized: true,
        root: makeRootLike(),
        init: () => {},
        onResize: onResize ?? (() => () => {}),
        dispose: () => {},
    };
}

describe("GameLobbyHostImpl.closeEntryPage cleanup failure isolation", () => {
    test("releases the session scope and preserves both errors when navigator.close and page destroy throw", async () => {
        const unloaded: string[] = [];
        const provider = createMemoryResourceProvider({
            unloadBundle: (bundle: string) => {
                unloaded.push(bundle);
            },
        });
        const uiHostModule = (await import(pathToFileURL(resolve(projectRoot, "assets/boot/host/UiHost.ts")).href)) as {
            createUiHost: (deps: { uiRoot: unknown; resourceProvider: IResourceProvider; logger: MemoryLogger }) => TestUiHostLike;
        };
        const host = uiHostModule.createUiHost({
            uiRoot: makeUiRoot(),
            resourceProvider: provider,
            logger: new MemoryLogger(),
        });
        expect(host.ensurePageAdapter()).toBe(true);

        const navCloseError = new Error("navigator close failed");
        const destroyError = new Error("page destroy failed");

        // 导航栈顶页：closeEntryPage 先 navigator.close(top.id)
        const navResult = host.navigator?.open("cardgame/battle", {
            layer: "normal",
        });
        expect(navResult?.ok).toBe(true);
        // 注入导航关闭失败与页面销毁失败（宿主的失败隔离不依赖具体失败来源）
        (host.navigator as unknown as { close: () => unknown }).close = () => {
            throw navCloseError;
        };
        (host.pageAdapter as unknown as { destroy: () => void }).destroy = () => {
            throw destroyError;
        };

        // 会话 scope：持有品类包，closeEntryPage 失败后仍须释放
        const scope = provider.createScope();
        const pkg = provider.loadPackage("cardgame", "CardGame/CardGame");
        scope.retain(pkg);
        await pkg.done;
        expect(provider.canUnload("cardgame")).toBe(false);

        // 注入会话状态（等价于 openEntryPage 成功路径建立的 lobbyPage/lobbyScope）。
        // 直接构造页面句柄而非经 adapter.createPage：createPage 会触发 createView →
        // getFuiComponentRegistry 在 globalThis 建立共享注册表单例，与并行运行的
        // fui-view/fui-view-host 测试的 isolateRegistry 隔离机制冲突（污染注册表）
        const page = {
            route: "cardgame/battle",
            layer: "normal",
            view: { name: "CardBattleView", dispose: () => {} },
            mounted: true,
            disposed: false,
            error: undefined,
        };
        const lobbyHostModule = (await import(pathToFileURL(lobbyHostFile).href)) as {
            createGameLobbyHost: (deps: { host: unknown; resourceProvider: IResourceProvider; logger: MemoryLogger }) => TestLobbyHostLike;
        };
        const lobby = lobbyHostModule.createGameLobbyHost({
            host,
            resourceProvider: provider,
            logger: new MemoryLogger(),
        });
        const lobbyState = lobby as unknown as {
            lobbyPage?: unknown;
            lobbyScope?: unknown;
        };
        lobbyState.lobbyPage = page;
        lobbyState.lobbyScope = scope;

        let thrown: unknown;
        try {
            await lobby.closeEntryPage({} as never);
        } catch (error) {
            thrown = error;
        }

        // 两个错误均被保留在聚合错误中
        expect(thrown).toBeInstanceOf(FuiViewCleanupError);
        const cleanupError = thrown as FuiViewCleanupError;
        expect(cleanupError.component).toBe("GameLobbyHostImpl.closeEntryPage");
        expect(cleanupError.errors).toEqual([navCloseError, destroyError]);
        // 会话作用域仍被释放：导航关闭与页面销毁失败不遗留资源
        expect(provider.canUnload("cardgame")).toBe(true);
        expect(unloaded).toContain("cardgame");
    });
});

describe("UiHost.dispose cleanup failure isolation", () => {
    test("runs navigator.dispose and global scope release even when resize unsubscribe and adapter dispose throw", async () => {
        const unloaded: string[] = [];
        const provider = createMemoryResourceProvider({
            unloadBundle: (bundle: string) => {
                unloaded.push(bundle);
            },
        });

        const unsubscribeError = new Error("resize unsubscribe failed");
        const adapterError = new Error("page adapter dispose failed");

        const uiHostModule = (await import(pathToFileURL(resolve(projectRoot, "assets/boot/host/UiHost.ts")).href)) as {
            createUiHost: (deps: { uiRoot: unknown; resourceProvider: IResourceProvider; logger: MemoryLogger }) => TestUiHostLike;
        };
        // onResize 返回抛错退订：adapter.dispose 失败后 nav/release 仍须执行
        const host = uiHostModule.createUiHost({
            uiRoot: makeUiRoot(() => () => {
                throw unsubscribeError;
            }),
            resourceProvider: provider,
            logger: new MemoryLogger(),
        });
        expect(host.ensurePageAdapter()).toBe(true);

        // 全局常驻 uiScope：release 触发 bundle 卸载可观察
        const handle = await host.loadPackage("ui", "Demo/Demo");
        expect(handle.state).toBe("ready");
        expect(provider.canUnload("ui")).toBe(false);

        // 记录 navigator.dispose 调用：adapter.dispose 抛错后导航器仍应释放
        const nav = host.navigator;
        expect(nav).toBeDefined();
        let navDisposed = false;
        (nav as unknown as { dispose: () => void }).dispose = () => {
            navDisposed = true;
        };
        // 注入 adapter.dispose 失败
        (host.pageAdapter as unknown as { dispose: () => void }).dispose = () => {
            throw adapterError;
        };

        let thrown: unknown;
        try {
            host.dispose();
        } catch (error) {
            thrown = error;
        }

        // 两个错误均被保留在聚合错误中（错误集合完整）
        expect(thrown).toBeInstanceOf(FuiViewCleanupError);
        const cleanupError = thrown as FuiViewCleanupError;
        expect(cleanupError.component).toBe("UiHost.dispose");
        expect(cleanupError.errors).toEqual([unsubscribeError, adapterError]);
        // navigator.dispose 与全局 uiScope.release 仍执行
        expect(navDisposed).toBe(true);
        expect(provider.canUnload("ui")).toBe(true);
        expect(unloaded).toContain("ui");
    });
});
