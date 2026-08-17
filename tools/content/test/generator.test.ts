import { describe, expect, it } from "bun:test";
import { getGenerator, listGenerators, registerGenerator, type GeneratorAdapter } from "../lib/generator";
import { registerBuiltinGenerators } from "../commands/assetgen";
import { createComfyUiGenerator } from "../generators/comfyui";
import { createPythonWaveGenerator } from "../generators/python-wave";
import { createPythonVfxGenerator } from "../generators/python-vfx";

describe("生成器注册表", () => {
    it("注册后可查与枚举", () => {
        const id = `test-gen-${Math.random().toString(36).slice(2)}`;
        const adapter: GeneratorAdapter = {
            id,
            describe: "测试生成器",
            generate: async (_dir) => ({ artifacts: [] }),
        };
        registerGenerator(adapter);
        expect(getGenerator(id)?.id).toBe(id);
        expect(listGenerators().some((g) => g.id === id)).toBe(true);
    });

    it("未知 id 返回 undefined", () => {
        expect(getGenerator("no-such-generator")).toBeUndefined();
    });

    it("内置生成器注册齐全", () => {
        registerBuiltinGenerators(); // 与 cli 入口同源
        const ids = listGenerators().map((g) => g.id);
        expect(ids).toContain("python-wave");
        expect(ids).toContain("python-vfx");
        expect(ids).toContain("python-character-actions");
        expect(ids).toContain("comfyui");
        expect(ids).toContain("fgui-sprite");
    });
});

describe("python-wave 参考生成器（本机 Python 3 实跑）", () => {
    it("生成合法 WAV 且契约一致", async () => {
        const { mkdtempSync, rmSync, existsSync } = await import("node:fs");
        const { tmpdir } = await import("node:os");
        const { join } = await import("node:path");
        const { validateArtifacts } = await import("../lib/artifact-validation");
        const dir = mkdtempSync(join(tmpdir(), "pw-test-"));
        try {
            const result = await createPythonWaveGenerator().generate(dir, { id: "sfx_x", duration: 0.2, freq: 880 });
            expect(result.artifacts).toHaveLength(1);
            expect(existsSync(join(dir, "sfx_x.wav"))).toBe(true);
            expect(validateArtifacts(dir, result.artifacts)).toHaveLength(0);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe("python-vfx 透明特效生成器（本机 Python + Pillow 实跑）", () => {
    it("生成合法 RGBA PNG 且契约一致", async () => {
        const { mkdtempSync, rmSync, existsSync } = await import("node:fs");
        const { tmpdir } = await import("node:os");
        const { join } = await import("node:path");
        const { validateArtifacts } = await import("../lib/artifact-validation");
        const dir = mkdtempSync(join(tmpdir(), "pvfx-test-"));
        try {
            const result = await createPythonVfxGenerator().generate(dir, { id: "fx_hit_test_00", effect: "hit_physical", index: 0, size: 128 });
            expect(result.artifacts).toHaveLength(1);
            expect(existsSync(join(dir, "fx_hit_test_00.png"))).toBe(true);
            expect(validateArtifacts(dir, result.artifacts)).toHaveLength(0);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe("comfyui 占位适配器", () => {
    it("未配置端点抛占位错误", async () => {
        const gen = createComfyUiGenerator();
        await expect(gen.generate("staging", {})).rejects.toThrow(/未配置端点/);
    });
});
