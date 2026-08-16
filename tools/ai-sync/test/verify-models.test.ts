import { describe, expect, it } from "bun:test";
import { parseModelListOutput, probeModels, type ProbeDeps } from "../lib/probe";
import type { Models } from "../lib/models";

const MODELS: Models = {
    "fgui-designer": { primary: "codexapis/gpt-5.6-sol", fallback: null },
    "visual-verifier": { primary: "codexapis/gpt-5.6-sol", fallback: "codexapis/gpt-5.5" },
};

function deps(cli: string[] | null, env: string[] = []): ProbeDeps {
    return { listModelsFromCli: async () => cli, envKeys: () => env };
}

describe("parseModelListOutput", () => {
    it("JSON 数组解析", () => {
        expect(parseModelListOutput('["a/b","c/d"]')).toEqual(["a/b", "c/d"]);
    });

    it("JSON 对象含 models 数组解析", () => {
        expect(parseModelListOutput('{"models":["a/b"]}')).toEqual(["a/b"]);
    });

    it("文本按行解析（忽略空行与注释）", () => {
        expect(parseModelListOutput("# header\na/b\n\nc/d\n")).toEqual(["a/b", "c/d"]);
    });

    it("空白输出返回空数组", () => {
        expect(parseModelListOutput("   \n  \n")).toEqual([]);
    });

    it("非 JSON 内容按行解析（# 开头视为注释过滤）", () => {
        expect(parseModelListOutput("###\n{not json")).toEqual(["{not json"]);
    });
});

describe("probeModels 分层探测", () => {
    it("cli 通道：命中 → available，未命中 → unavailable", async () => {
        const report = await probeModels(MODELS, deps(["codexapis/gpt-5.6-sol"]));
        expect(report.channel).toBe("cli");
        const designer = report.roles.find((r) => r.role === "fgui-designer");
        expect(designer?.primaryStatus).toBe("available");
        expect(designer?.fallbackStatus).toBe("none"); // fallback null
        const verifier = report.roles.find((r) => r.role === "visual-verifier");
        expect(verifier?.primaryStatus).toBe("available");
        expect(verifier?.fallbackStatus).toBe("unavailable"); // gpt-5.5 不在列表
    });

    it("env 通道：CLI 不可达但有凭据 → not-probed（仅配置检查）", async () => {
        const report = await probeModels(MODELS, deps(null, ["CODEX_API_KEY"]));
        expect(report.channel).toBe("env");
        expect(report.channelNote).toContain("CODEX_API_KEY");
        expect(report.roles.every((r) => r.primaryStatus === "not-probed")).toBe(true);
    });

    it("none 通道：全部不可用 → not-configured", async () => {
        const report = await probeModels(MODELS, deps(null));
        expect(report.channel).toBe("none");
        expect(report.roles.every((r) => r.primaryStatus === "not-configured")).toBe(true);
    });

    it("角色按 id 排序输出", async () => {
        const report = await probeModels(MODELS, deps(null));
        const roles = report.roles.map((r) => r.role);
        expect(roles).toEqual([...roles].sort());
    });
});
