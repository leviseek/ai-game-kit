import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { GeneratedArtifact, GeneratorAdapter, GeneratorParams, GeneratorResult } from "../lib/generator";

const EFFECT_COUNTS = {
    hit_physical: 6,
    slash_arc: 6,
    fireball_projectile: 8,
    fireball_impact: 10,
    heal_aura: 10,
} as const;

type EffectName = keyof typeof EFFECT_COUNTS;

/** Pillow 驱动的确定性透明战斗特效帧生成器；每次只产出一帧，便于逐帧登记。 */
export function createPythonVfxGenerator(): GeneratorAdapter {
    return {
        id: "python-vfx",
        describe: "生成透明 Q 版战斗特效单帧；参数：effect/index/id，可选 size（默认128）",
        async generate(stagingDir: string, params: GeneratorParams): Promise<GeneratorResult> {
            const effect = String(params.effect ?? "") as EffectName;
            const count = EFFECT_COUNTS[effect];
            if (count === undefined) {
                throw new Error(`python-vfx effect 非法: ${effect}（可用: ${Object.keys(EFFECT_COUNTS).join(", ")}）`);
            }
            const index = Number(params.index);
            if (!Number.isInteger(index) || index < 0 || index >= count) {
                throw new Error(`python-vfx index 非法: ${params.index}（${effect} 需要 0..${count - 1}）`);
            }
            const size = Number(params.size ?? 128);
            if (!Number.isInteger(size) || size < 64 || size > 512) {
                throw new Error(`python-vfx size 非法: ${params.size}`);
            }
            const id = String(params.id ?? `fx_${effect}_${String(index).padStart(2, "0")}`);
            const outName = `${id}.png`;
            const script = join(import.meta.dirname, "python-vfx.py");
            const result = spawnSync("python", [script, "--out", join(stagingDir, outName), "--effect", effect, "--index", String(index), "--count", String(count), "--size", String(size)], {
                encoding: "utf8",
            });
            if (result.error !== undefined && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
                throw new Error("python 不可用（python-vfx 需要 Python 3 + Pillow）");
            }
            if (result.status !== 0) {
                throw new Error(`python-vfx 生成失败: ${(result.stderr ?? "").trim() || (result.stdout ?? "").trim()}`);
            }
            const artifacts: GeneratedArtifact[] = [{ relPath: outName, kind: "png", width: size, height: size }];
            return { artifacts };
        },
    };
}
