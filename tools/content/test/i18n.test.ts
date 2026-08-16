import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isI18nKeyFormat, loadI18n, placeholderSet, validateI18n } from "../lib/i18n";

describe("isI18nKeyFormat", () => {
    it("合法 key 通过（含下划线/连字符段）", () => {
        expect(isI18nKeyFormat("auto_battle.buffs.attack-up.name")).toBe(true);
        expect(isI18nKeyFormat("game.heroes.h1.name")).toBe(true);
    });

    it("非法 key 拒绝（中文/大写/无点分）", () => {
        expect(isI18nKeyFormat("攻击强化")).toBe(false);
        expect(isI18nKeyFormat("Game.Heroes.Name")).toBe(false);
        expect(isI18nKeyFormat("single")).toBe(false);
    });
});

describe("placeholderSet", () => {
    it("提取命名占位符", () => {
        expect([...placeholderSet("造成 {value} 点伤害，剩余 {count} 次")].sort()).toEqual(["count", "value"]);
        expect(placeholderSet("无占位符").size).toBe(0);
    });
});

describe("loadI18n / validateI18n", () => {
    let root: string;
    let dir: string;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), "i18n-test-"));
        dir = join(root, "assets", "game-content", "i18n");
        mkdirSync(dir, { recursive: true });
    });
    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    function writeLang(lang: string, entries: Record<string, string>): void {
        writeFileSync(join(dir, `${lang}.json`), JSON.stringify(entries));
    }

    it("缺主语言表返回 null", () => {
        writeLang("en-US", {});
        expect(loadI18n(root)).toBeNull();
    });

    it("跨语言缺 key 报 error、多余 key 报 warning", () => {
        writeLang("zh-CN", { "a.b": "x", "a.c": "y" });
        writeLang("en-US", { "a.b": "x" });
        const state = loadI18n(root);
        expect(state).not.toBeNull();
        const issues = validateI18n(state!);
        expect(issues.some((i) => i.code === "i18n-missing-key" && i.message.includes("a.c"))).toBe(true);
    });

    it("占位符不一致报 error（忽略顺序）", () => {
        writeLang("zh-CN", { "a.b": "造成 {value} 点伤害" });
        writeLang("en-US", { "a.b": "Deal {value} damage" });
        writeLang("ja-JP", { "a.b": "ダメージ {other}" });
        const state = loadI18n(root);
        const issues = validateI18n(state!);
        expect(issues.some((i) => i.code === "i18n-placeholder-mismatch" && i.message.includes("ja-JP"))).toBe(true);
        expect(issues.some((i) => i.code === "i18n-placeholder-mismatch" && i.message.includes("en-US"))).toBe(false); // 顺序不同不算不一致
    });
});
