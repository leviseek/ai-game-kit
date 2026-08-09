import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

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
