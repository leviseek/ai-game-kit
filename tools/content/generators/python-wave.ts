/**
 * python-wave 参考适配器：外部进程生成器示例（Python3 标准库生成 WAV）。
 * 证明「AI 编排 → 外部进程生成 → staging → 契约校验 → ingest」链路可行；
 * Python 缺失时抛环境错误（assetgen 按环境缺失处理）。
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { GeneratedArtifact, GeneratorAdapter, GeneratorParams, GeneratorResult } from "../lib/generator";

export function createPythonWaveGenerator(): GeneratorAdapter {
    return {
        id: "python-wave",
        describe: "Python3 标准库生成 WAV 音效（正弦/噪声 + 包络），无第三方依赖；参数：id/duration/freq/waveform",
        async generate(stagingDir: string, params: GeneratorParams): Promise<GeneratorResult> {
            const outName = `${String(params.id ?? "sfx_wave")}.wav`;
            const duration = Number(params.duration ?? 0.3);
            const script = join(import.meta.dirname, "python-wave.py");
            const args = [script, "--out", join(stagingDir, outName), "--duration", String(duration)];
            if (params.freq !== undefined) args.push("--freq", String(params.freq));
            if (params.waveform !== undefined) args.push("--waveform", String(params.waveform));
            const result = spawnSync("python", args, { encoding: "utf8" });
            if (result.error !== undefined && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
                throw new Error("python 不可用（参考生成器 python-wave 需要 Python 3，请安装或改用其他生成器）");
            }
            if (result.status !== 0) {
                throw new Error(`python-wave 生成失败: ${(result.stderr ?? "").trim() || (result.stdout ?? "").trim()}`);
            }
            const artifacts: GeneratedArtifact[] = [{ relPath: outName, kind: "wav", durationSec: duration }];
            return { artifacts };
        },
    };
}
