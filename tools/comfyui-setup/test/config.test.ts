import { describe, expect, it } from "bun:test";
import { loadConfig, workspaceRoot } from "../config";
import { join } from "node:path";

describe("comfyui-setup config", () => {
    it("默认配置字段齐全（内置 sd_turbo 清单）", () => {
        const config = loadConfig();
        expect(config.port).toBe(8188);
        expect(config.venvName).toBe("venv");
        expect(config.torchIndexUrl).toContain("download.pytorch.org");
        expect(config.gitUrl).toContain("ComfyUI");
        expect(config.models.length).toBeGreaterThan(0);
        expect(config.models[0]!.id).toBe("sd_turbo");
        expect(config.models[0]!.size).toBeGreaterThan(1_000_000_000);
        expect(config.models[0]!.file).toMatch(/^models\/checkpoints\//);
    });

    it("用户配置字段级覆盖默认值", () => {
        const config = loadConfig(join(workspaceRoot(), "comfyui.config.json"));
        expect(config.installDir).toBe("D:/dev/ComfyUI");
        expect(config.pipIndexUrl).toContain("tuna");
    });

    it("缺失配置文件时回退内置默认（installDir 用默认值）", () => {
        const config = loadConfig(join(workspaceRoot(), "does-not-exist.json"));
        expect(config.installDir).toBe("D:/dev/ComfyUI");
        expect(config.models[0]!.id).toBe("sd_turbo");
    });
});
