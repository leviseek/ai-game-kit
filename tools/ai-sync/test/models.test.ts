import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { createFixture, type Fixture, write } from "./helpers";
import { loadModels, renderTemplate, validateAgentTemplates, validateModels } from "../lib/models";

describe("loadModels / validateModels", () => {
    let fx: Fixture;

    beforeEach(() => {
        fx = createFixture();
    });
    afterEach(() => fx.cleanup());

    it("加载合法 models.json", () => {
        write(join(fx.sync, "registry", "models.json"), JSON.stringify({ "demo-role": { primary: "p/model", fallback: null } }));
        expect(loadModels(fx.sync)).toEqual({ "demo-role": { primary: "p/model", fallback: null } });
    });

    it("models.json 缺失时返回空表（由模板校验兜底）", () => {
        expect(loadModels(fx.sync)).toEqual({});
    });

    it("primary 缺失报 empty-primary", () => {
        const issues = validateModels({ "demo-role": { primary: "", fallback: null } });
        expect(issues.some((i) => i.code === "empty-primary" && i.severity === "error")).toBe(true);
    });

    it("fallback 非法值报 invalid-fallback", () => {
        const issues = validateModels({ "demo-role": { primary: "p/model", fallback: "" } });
        expect(issues.some((i) => i.code === "invalid-fallback")).toBe(true);
    });

    it("角色 id 非法报 invalid-role", () => {
        const issues = validateModels({ "Bad Role": { primary: "p/model", fallback: null } });
        expect(issues.some((i) => i.code === "invalid-role")).toBe(true);
    });

    it("合法条目无问题", () => {
        expect(validateModels({ "demo-role": { primary: "p/model", fallback: "p/backup" } })).toHaveLength(0);
    });
});

describe("renderTemplate", () => {
    const models = { "demo-role": { primary: "provider/model-x", fallback: null } };

    it("替换已知占位符", () => {
        const result = renderTemplate("---\nmodel: {{model:demo-role}}\n---\n", models);
        expect(result.ok).toBe(true);
        expect(result.content).toBe("---\nmodel: provider/model-x\n---\n");
    });

    it("无占位符内容原样返回", () => {
        const result = renderTemplate("plain body\n", models);
        expect(result.ok).toBe(true);
        expect(result.content).toBe("plain body\n");
    });

    it("未知角色报错", () => {
        const result = renderTemplate("{{model:ghost}}", models);
        expect(result.ok).toBe(false);
        expect(result.error).toContain("ghost");
    });

    it("空角色占位符（语法错误）残留报错", () => {
        const result = renderTemplate("{{model:}}", models);
        expect(result.ok).toBe(false);
        expect(result.error).toContain("残留");
    });

    it("多角色各自替换", () => {
        const models2 = { a: { primary: "pa", fallback: null }, b: { primary: "pb", fallback: null } };
        const result = renderTemplate("{{model:a}}|{{model:b}}", models2);
        expect(result.ok).toBe(true);
        expect(result.content).toBe("pa|pb");
    });
});

describe("validateAgentTemplates", () => {
    let fx: Fixture;

    beforeEach(() => {
        fx = createFixture();
    });
    afterEach(() => fx.cleanup());

    it("有效占位符无问题", () => {
        write(join(fx.sync, "registry", "agents", "demo-agent.md"), "model: {{model:demo-role}}\n");
        const issues = validateAgentTemplates(fx.sync, { "demo-role": { primary: "p/m", fallback: null } });
        expect(issues).toHaveLength(0);
    });

    it("未知角色报 template-error", () => {
        write(join(fx.sync, "registry", "agents", "demo-agent.md"), "model: {{model:ghost}}\n");
        const issues = validateAgentTemplates(fx.sync, { "demo-role": { primary: "p/m", fallback: null } });
        expect(issues.some((i) => i.code === "template-error" && i.message.includes("ghost"))).toBe(true);
    });
});
