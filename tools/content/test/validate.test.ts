import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateContent } from "../lib/validate";
import type { TableSchema } from "../lib/schemas";

/** 小规模 fixture schema：覆盖类型/枚举/范围/必填/i18n-key/跨表引用/id。 */
const HERO_SCHEMA: TableSchema = {
    table: "heroes",
    file: "game-content/heroes.json",
    shape: "array",
    fields: [
        { key: "id", type: "id", idKey: true },
        { key: "name", type: "i18n-key" },
        { key: "position", type: "enum", enum: ["front", "mid", "back"] },
        { key: "hp", type: "number", min: 1, max: 1000 },
        { key: "skillId", type: "id", refTable: "skills" },
    ],
};
const SKILL_SCHEMA: TableSchema = { table: "skills", file: "game-content/skills.json", shape: "array", fields: [{ key: "id", type: "id", idKey: true }] };

describe("validateContent", () => {
    let root: string;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), "content-test-"));
        mkdirSync(join(root, "game-content"), { recursive: true });
    });
    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    function writeConfig(rel: string, content: unknown): void {
        writeFileSync(join(root, rel), JSON.stringify(content));
    }

    it("合法配置通过（含 i18n 主语言表）", () => {
        writeConfig("game-content/heroes.json", [{ id: "h1", name: "game.heroes.h1.name", position: "front", hp: 50, skillId: "s1" }]);
        writeConfig("game-content/skills.json", [{ id: "s1" }]);
        const i18n = { dir: "", main: { lang: "zh-CN", entries: { "game.heroes.h1.name": "英雄" } }, translations: [] };
        expect(validateContent(root, [HERO_SCHEMA, SKILL_SCHEMA], i18n)).toHaveLength(0);
    });

    it("类型/枚举/范围/必填各自报错", () => {
        writeConfig("game-content/heroes.json", [{ id: "h1", name: "game.heroes.h1.name", position: "sideways", hp: 0 }]);
        writeConfig("game-content/skills.json", [{ id: "s1" }]);
        const issues = validateContent(root, [HERO_SCHEMA, SKILL_SCHEMA], null);
        const codes = new Set(issues.map((i) => i.code));
        expect(codes.has("field-enum")).toBe(true);
        expect(codes.has("field-range")).toBe(true);
        expect(codes.has("field-missing")).toBe(true); // skillId 缺失
    });

    it("表内 id 重复报错", () => {
        writeConfig("game-content/heroes.json", [
            { id: "h1", name: "game.heroes.h1.name", position: "front", hp: 10, skillId: "s1" },
            { id: "h1", name: "game.heroes.h1.name", position: "back", hp: 10, skillId: "s1" },
        ]);
        writeConfig("game-content/skills.json", [{ id: "s1" }]);
        const issues = validateContent(root, [HERO_SCHEMA, SKILL_SCHEMA], null);
        expect(issues.some((i) => i.code === "id-duplicate")).toBe(true);
    });

    it("跨表悬空引用报错", () => {
        writeConfig("game-content/heroes.json", [{ id: "h1", name: "game.heroes.h1.name", position: "front", hp: 10, skillId: "ghost" }]);
        writeConfig("game-content/skills.json", [{ id: "s1" }]);
        const issues = validateContent(root, [HERO_SCHEMA, SKILL_SCHEMA], null);
        const dangling = issues.find((i) => i.code === "ref-dangling");
        expect(dangling).toBeDefined();
        expect(dangling?.message).toContain("ghost");
    });

    it("内嵌文本（非 key 中文）报 embedded-text", () => {
        writeConfig("game-content/heroes.json", [{ id: "h1", name: "坦克", position: "front", hp: 10, skillId: "s1" }]);
        writeConfig("game-content/skills.json", [{ id: "s1" }]);
        const issues = validateContent(root, [HERO_SCHEMA, SKILL_SCHEMA], null);
        expect(issues.some((i) => i.code === "embedded-text")).toBe(true);
    });

    it("i18n-key 引用未声明 key 报 i18n-key-unknown", () => {
        writeConfig("game-content/heroes.json", [{ id: "h1", name: "game.heroes.h1.name", position: "front", hp: 10, skillId: "s1" }]);
        writeConfig("game-content/skills.json", [{ id: "s1" }]);
        const i18n = { dir: "", main: { lang: "zh-CN", entries: { "other.key": "x" } }, translations: [] };
        const issues = validateContent(root, [HERO_SCHEMA, SKILL_SCHEMA], i18n);
        expect(issues.some((i) => i.code === "i18n-key-unknown")).toBe(true);
    });

    it("配置缺失报 config-missing", () => {
        const issues = validateContent(root, [HERO_SCHEMA], null);
        expect(issues.some((i) => i.code === "config-missing")).toBe(true);
    });
});
