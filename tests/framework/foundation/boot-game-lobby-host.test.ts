import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

import type { IResourceProvider } from "../../../assets/framework";
import { createFairyGuiMock } from "./helpers/fairygui-mock";
import { createMemoryResourceProvider } from "../../../assets/framework/adapters/memory/MemoryResourceProvider";
import { MemoryLogger } from "../support/MemoryLogger";

// UiHost 值导入 fairygui-cc（页面适配器边界），统一使用共享 fixture；
// 经动态导入加载，保证 mock.module 先于模块图注册（与 cocos-ui-root 等一致）
mock.module("fairygui-cc", () => createFairyGuiMock());

const projectRoot = resolve(import.meta.dir, "../../..");
const lobbyHostFile = resolve(projectRoot, "assets/boot/host/GameLobbyHostImpl.ts");

describe("GameLobbyHostImpl source contract", () => {
    test("loads the shared ui dependency Common before opening any package page", () => {
        expect(existsSync(lobbyHostFile)).toBe(true);

        const source = readFileSync(lobbyHostFile, "utf8");

        // Demo/CardGame 跨包引用通用资源包 Common（按钮/进度条组件）；fgui
        // loadPackage 不自动加载依赖包，若 Common 未先注册则组件退化为空、点击
        // 不触发。契约要求 ensureSharedUiDependencies（加载 Common）先于入口页
        // /全局页 package 加载。
        expect(source).toMatch(/ensureSharedUiDependencies/);
        expect(source).toMatch(/Common\/Common/);

        // 调用点顺序：openEntryPage 与 openGlobalPage 内部都先调依赖再加载目标包，
        // 保证"依赖先注册"语义（源码顺序 = 执行顺序的强契约）
        const ensureCall = source.indexOf("ensureSharedUiDependencies()");
        expect(ensureCall).toBeGreaterThan(-1);

        // 入口页与全局页共用通用包加载路径（`${entry.packageName}/...`），各一次
        const pkgLoads = [
            ...source.matchAll(/const pkgPath = `\$\{entry\.packageName\}/g),
        ].map((match) => match.index ?? -1);
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
        expect(source).toMatch(/bundleSentinel\(bundle\)/);
        expect(source).toMatch(/resourceProvider\.load\(\s*bundle,\s*this\.bundleSentinel\(bundle\)\s*,\s*\)/);
        expect(source).toMatch(/return bundle === "game" \? "game" : "placeholder";/);
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
        const uiHostModule = (await import(
            pathToFileURL(resolve(projectRoot, "assets/boot/host/UiHost.ts")).href
        )) as {
            createUiHost: (deps: {
                uiRoot: unknown;
                resourceProvider: IResourceProvider;
                logger: MemoryLogger;
            }) => {
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
                subscribeResize: () => () => { },
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
