import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { GeneratedArtifact, GeneratorAdapter, GeneratorParams, GeneratorResult } from "../lib/generator";

const ACTION_COUNTS = { idle: 10, walk: 8, run: 8, attack: 6, slash: 8, hit: 4, weak: 6, stun: 4, death: 10, skillRaise: 8 } as const;

/** 将 ComfyUI 动作原图统一抠图、缩放，并补齐确定性派生动作。 */
export function createPythonCharacterActionsGenerator(): GeneratorAdapter {
    return {
        id: "python-character-actions",
        describe: "将角色参考图与 ComfyUI 动作清单转换为 256x384 RGBA 完整动作包；参数：character/reference/rawManifest",
        async generate(stagingDir: string, params: GeneratorParams): Promise<GeneratorResult> {
            const character = String(params.character ?? "");
            const reference = String(params.reference ?? "");
            const rawManifest = String(params.rawManifest ?? "");
            if (!/^[a-z][a-z0-9-]*$/.test(character)) throw new Error(`python-character-actions character 非法: ${character}`);
            if (reference.length === 0 || rawManifest.length === 0) throw new Error("python-character-actions 需要 reference 与 rawManifest");
            const script = join(import.meta.dirname, "python-character-actions.py");
            const result = spawnSync("python", [script, "--out-dir", stagingDir, "--character", character, "--reference", reference, "--raw-manifest", rawManifest], {
                encoding: "utf8",
            });
            if (result.error !== undefined && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
                throw new Error("python 不可用（python-character-actions 需要 Python 3 + OpenCV）");
            }
            if (result.status !== 0) throw new Error(`python-character-actions 生成失败: ${(result.stderr ?? "").trim() || (result.stdout ?? "").trim()}`);
            const artifacts: GeneratedArtifact[] = [];
            for (const [action, count] of Object.entries(ACTION_COUNTS)) {
                for (let index = 0; index < count; index++) {
                    const fileAction = action === "skillRaise" ? "skill_raise" : action;
                    artifacts.push({ relPath: `${character}_ai_${fileAction}_${String(index).padStart(2, "0")}.png`, kind: "png", width: 256, height: 384 });
                }
            }
            return { artifacts };
        },
    };
}
