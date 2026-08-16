import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findChrome, findCreatorHome, getCreatorTempDir, getCreatorVersion } from "../lib/env";

describe("项目定位纯函数", () => {
    it("getCreatorVersion 读真实 package.json", () => {
        expect(getCreatorVersion()).toBe("3.8.8");
    });

    it("getCreatorTempDir 指向 temp/creator", () => {
        const dir = getCreatorTempDir();
        expect(dir.endsWith(join("temp", "creator"))).toBe(true);
    });
});

describe("findCreatorHome / findChrome（fixtures 驱动，不依赖真实安装）", () => {
    let fakeHome: string;
    let fakeChrome: string;
    let savedHome: string | undefined;
    let savedChrome: string | undefined;

    beforeEach(() => {
        fakeHome = mkdtempSync(join(tmpdir(), "creator-home-test-"));
        fakeChrome = mkdtempSync(join(tmpdir(), "creator-chrome-test-"));
        writeFileSync(join(fakeHome, "CocosCreator.exe"), "fake");
        writeFileSync(join(fakeChrome, "chrome.exe"), "fake");
        savedHome = process.env.COCOS_CREATOR_HOME;
        savedChrome = process.env.CHROME_PATH;
    });

    afterEach(() => {
        rmSync(fakeHome, { recursive: true, force: true });
        rmSync(fakeChrome, { recursive: true, force: true });
        if (savedHome === undefined) delete process.env.COCOS_CREATOR_HOME;
        else process.env.COCOS_CREATOR_HOME = savedHome;
        if (savedChrome === undefined) delete process.env.CHROME_PATH;
        else process.env.CHROME_PATH = savedChrome;
    });

    it("COCOS_CREATOR_HOME 指向含 exe 的目录时直接返回", () => {
        process.env.COCOS_CREATOR_HOME = fakeHome;
        expect(findCreatorHome()).toBe(fakeHome);
    });

    it("COCOS_CREATOR_HOME 指向不含 exe 的目录时不误报（走后续探测链，不抛路径错误）", () => {
        const empty = mkdtempSync(join(tmpdir(), "creator-empty-"));
        try {
            process.env.COCOS_CREATOR_HOME = empty;
            expect(() => findCreatorHome()).not.toThrowError(/CocosCreator.exe/); // 不因 env 路径直接抛错
        } finally {
            rmSync(empty, { recursive: true, force: true });
        }
    });

    it("CHROME_PATH 指向存在的文件时返回", () => {
        process.env.CHROME_PATH = join(fakeChrome, "chrome.exe");
        expect(findChrome()).toBe(join(fakeChrome, "chrome.exe"));
    });
});
