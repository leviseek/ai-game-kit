/**
 * ComfyUI HTTP 生成器：完整客户端（协议对齐官方 ComfyUI API）。
 *
 * 流程：
 *   1. POST /prompt       提交工作流（{ prompt, client_id }）→ { prompt_id }
 *   2. 轮询 GET /history/<prompt_id>  直到输出图片出现（生成中返回空）
 *   3. GET /view?filename&subfolder&type  下载每张图片到 staging，声明 PNG 契约
 *
 * 端点：options.endpoint ?? env COMFYUI_ENDPOINT；未配置时 generate 抛明确错误。
 * 产物尺寸未知（ComfyUI 输出由工作流决定），契约声明不带 width/height——
 * 管线校验对该产物只查存在性 + PNG 魔数签名（尺寸声明缺失时跳过尺寸比对）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GeneratedArtifact, GeneratorAdapter, GeneratorParams, GeneratorResult } from "../lib/generator";

export interface ComfyUiOptions {
    readonly endpoint?: string;
    readonly clientId?: string;
    readonly pollIntervalMs?: number;
    readonly timeoutMs?: number;
}

interface ComfyImageRef {
    readonly filename: string;
    readonly subfolder: string;
    readonly type: string;
}

interface ComfyHistoryEntry {
    readonly outputs?: Record<string, { readonly images?: readonly ComfyImageRef[] }>;
}

export function createComfyUiGenerator(options: ComfyUiOptions = {}): GeneratorAdapter {
    return {
        id: "comfyui",
        describe: "ComfyUI HTTP 生成器（POST /prompt + 轮询 /history + /view 下载）；参数：workflow（JSON）/workflow-file（路径）/id；端点 env COMFYUI_ENDPOINT",
        async generate(stagingDir: string, params: GeneratorParams): Promise<GeneratorResult> {
            const endpoint = options.endpoint ?? process.env.COMFYUI_ENDPOINT;
            if (endpoint === undefined) {
                throw new Error("ComfyUI 未配置端点：设置环境变量 COMFYUI_ENDPOINT（如 http://127.0.0.1:8188）后再调用");
            }
            const workflow = resolveWorkflow(params);
            if (workflow === null) {
                throw new Error("comfyui 需要 --workflow <工作流 JSON> 或 --workflow-file <路径>");
            }

            const clientId = options.clientId ?? `assetgen-${Date.now()}`;
            const promptResponse = await fetch(`${endpoint}/prompt`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: workflow, client_id: clientId }),
            });
            if (!promptResponse.ok) {
                throw new Error(`ComfyUI /prompt 失败（HTTP ${promptResponse.status}）: ${(await promptResponse.text()).slice(0, 200)}`);
            }
            const promptData = (await promptResponse.json()) as { prompt_id?: string };
            const promptId = promptData.prompt_id;
            if (promptId === undefined) {
                throw new Error("ComfyUI /prompt 未返回 prompt_id（工作流可能不完整）");
            }

            // 轮询 /history 直到输出图片出现
            const images = await pollHistoryImages(endpoint, promptId, options);
            if (images.length === 0) {
                throw new Error(`ComfyUI 生成超时（prompt_id=${promptId}，无输出图片）`);
            }

            const artifacts: GeneratedArtifact[] = [];
            for (const [index, image] of images.entries()) {
                const url = `${endpoint}/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder)}&type=${encodeURIComponent(image.type)}`;
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`ComfyUI /view 下载失败: ${image.filename}（HTTP ${response.status}）`);
                }
                const bytes = Buffer.from(await response.arrayBuffer());
                const relPath = `${String(params.id ?? "comfyui")}_${index}.png`;
                writeFileSync(join(stagingDir, relPath), bytes);
                artifacts.push({ relPath, kind: "png" });
            }
            return { artifacts };
        },
    };
}

/** 工作流解析：--workflow（JSON 字符串或对象）或 --workflow-file（读文件）。 */
function resolveWorkflow(params: GeneratorParams): unknown | null {
    if (params.workflow !== undefined) {
        if (typeof params.workflow === "string") {
            try {
                return JSON.parse(params.workflow);
            } catch {
                return params.workflow; // 非 JSON 字符串原样交给服务端（非法会在 /prompt 失败时暴露）
            }
        }
        return params.workflow;
    }
    if (typeof params["workflow-file"] === "string") {
        try {
            return JSON.parse(readFileSync(params["workflow-file"], "utf8"));
        } catch (error) {
            throw new Error(`--workflow-file 读取失败: ${params["workflow-file"]}（${error instanceof Error ? error.message : String(error)}）`);
        }
    }
    return null;
}

async function pollHistoryImages(endpoint: string, promptId: string, options: ComfyUiOptions): Promise<readonly ComfyImageRef[]> {
    const deadline = Date.now() + (options.timeoutMs ?? 120_000);
    const intervalMs = options.pollIntervalMs ?? 1000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${endpoint}/history/${promptId}`);
            if (response.ok) {
                const history = (await response.json()) as Record<string, ComfyHistoryEntry>;
                const entry = history[promptId];
                if (entry?.outputs !== undefined) {
                    const images = Object.values(entry.outputs).flatMap((output) => output.images ?? []);
                    if (images.length > 0) return images;
                }
            }
        } catch {
            // 服务端瞬时不可达：继续轮询
        }
        await sleep(intervalMs);
    }
    return [];
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
