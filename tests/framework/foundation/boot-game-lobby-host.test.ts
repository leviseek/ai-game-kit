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
        // /列表页 package 加载。
        expect(source).toMatch(/ensureSharedUiDependencies/);
        expect(source).toMatch(/Common\/Common/);

        // 调用点顺序：openEntryPage 与 openListPage 内部都先调依赖再加载目标包，
        // 保证"依赖先注册"语义（源码顺序 = 执行顺序的强契约）
        const ensureCall = source.indexOf("ensureSharedUiDependencies()");
        expect(ensureCall).toBeGreaterThan(-1);

        const listPackage = source.indexOf(
            "const pkgPath = `${LOBBY_LIST_ENTRY.packageName}",
        );
        const entryPackage = source.indexOf(
            "const pkgPath = `${entry.packageName}/${entry.packageName}`",
        );
        expect(entryPackage).toBeGreaterThan(ensureCall);
        expect(listPackage).toBeGreaterThan(ensureCall);
    });

    test("exposes the default list entry opening path", () => {
        const source = readFileSync(lobbyHostFile, "utf8");

        // 默认入口：无 URL 参数时打开列表页（替代空白启动）
        expect(source).toMatch(/openListPageWithRetry/);
        expect(source).toMatch(/LOBBY_LIST_ENTRY/);
        expect(source).toMatch(/lobbyItemNodeName/);
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

        // 列表页经全局 uiScope 常驻：GameLobbyHostImpl.openListPage 走 host.loadPackage
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
