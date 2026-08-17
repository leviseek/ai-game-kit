/**
 * model —— 从配置清单下载模型权重到 installDir（多线程分片，断点续传：已存在同大小跳过）。
 * 用法: comfyui-setup model [--id sd_turbo] [--threads 8]
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { downloadFile } from "../lib/download";
import type { ComfyUiConfig } from "../config";

export async function downloadModel(config: ComfyUiConfig, options: { id?: string; threads?: number } = {}): Promise<number> {
    const specs = options.id !== undefined ? config.models.filter((m) => m.id === options.id) : config.models;
    if (specs.length === 0) {
        console.error(`[comfyui-setup] 清单中无匹配模型（id=${options.id ?? "全部"}）；可用: ${config.models.map((m) => m.id).join(", ")}`);
        return 2;
    }
    let failed = 0;
    for (const spec of specs) {
        const target = join(config.installDir, spec.file);
        // 新模型类别（如 ipadapter）可能尚无目录，下载器只负责文件内容，不隐式创建父目录。
        mkdirSync(dirname(target), { recursive: true });
        console.log(`[comfyui-setup] 下载模型 ${spec.id} → ${target}（${(spec.size / 1e6).toFixed(0)}MB，threads=${options.threads ?? 8}）`);
        try {
            const result = await downloadFile(spec.url, target, {
                threads: options.threads,
                onProgress: (p) => {
                    console.log(`  ${(p.doneBytes / 1e6).toFixed(0)}/${(p.totalBytes / 1e6).toFixed(0)}MB  ${p.speedMbps.toFixed(1)}MB/s`);
                },
            });
            console.log(result.skipped ? `[comfyui-setup] ${spec.id} 已存在且完整（跳过）` : `[comfyui-setup] ${spec.id} 下载完成`);
        } catch (error) {
            console.error(`[comfyui-setup] ${spec.id} 下载失败: ${error instanceof Error ? error.message : String(error)}`);
            failed++;
        }
    }
    return failed > 0 ? 1 : 0;
}
