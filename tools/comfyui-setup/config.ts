/**
 * ComfyUI 部署配置：默认值 + 用户覆盖。
 * 配置来源：<workspace>/comfyui.config.json（可 --config 覆盖）；缺省字段用内置默认。
 * ComfyUI 本体与模型权重永远在仓库外（installDir），本文件只声明「如何部署」。
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

export interface ModelSpec {
    readonly id: string;
    /** 下载 URL（如 hf-mirror 直链）。 */
    readonly url: string;
    /** 期望字节数（多线程分片下载前探测校验）。 */
    readonly size: number;
    /** 相对 installDir 的目标路径（如 models/checkpoints/sd_turbo.safetensors）。 */
    readonly file: string;
}

export interface CustomNodeSpec {
    readonly id: string;
    /** 自定义节点 git 仓库；部署到 installDir/custom_nodes/<id>。 */
    readonly gitUrl: string;
}

export interface ComfyUiConfig {
    /** ComfyUI 安装目录（仓库外；未存在时 install 会 git clone）。 */
    readonly installDir: string;
    readonly port: number;
    readonly venvName: string;
    /** CPU-only PyTorch 的 wheel 源。 */
    readonly torchIndexUrl: string;
    /** PyPI 镜像（pip install -r requirements.txt 用）。 */
    readonly pipIndexUrl: string;
    /** ComfyUI git 仓库（install 首次克隆）。 */
    readonly gitUrl: string;
    readonly models: readonly ModelSpec[];
    readonly customNodes: readonly CustomNodeSpec[];
}

const DEFAULTS: Omit<ComfyUiConfig, "installDir" | "models" | "customNodes"> = {
    port: 8188,
    venvName: "venv",
    // GPU 优先：cu130 支持 NVIDIA 40 系（cu126 在 40 系上输出恒定灰）；无 GPU 环境可改 cpu index
    torchIndexUrl: "https://download.pytorch.org/whl/cu130",
    pipIndexUrl: "https://pypi.tuna.tsinghua.edu.cn/simple",
    gitUrl: "https://github.com/comfyanonymous/ComfyUI.git",
};

/** 内置默认模型清单：最小可出图（sd-turbo，5.2GB fp32，CPU 1-4 步采样）。 */
const DEFAULT_MODELS: readonly ModelSpec[] = [
    {
        id: "sd_turbo",
        url: "https://hf-mirror.com/stabilityai/sd-turbo/resolve/main/sd_turbo.safetensors",
        size: 5_214_561_328,
        file: "models/checkpoints/sd_turbo.safetensors",
    },
];

export function workspaceRoot(): string {
    return resolve(import.meta.dirname);
}

/** 读取配置：用户文件优先，字段级合并默认值。 */
export function loadConfig(configPath?: string): ComfyUiConfig {
    const file = configPath ?? join(workspaceRoot(), "comfyui.config.json");
    const user = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Partial<ComfyUiConfig>) : {};
    return {
        installDir: user.installDir ?? "D:/dev/ComfyUI",
        port: user.port ?? DEFAULTS.port,
        venvName: user.venvName ?? DEFAULTS.venvName,
        torchIndexUrl: user.torchIndexUrl ?? DEFAULTS.torchIndexUrl,
        pipIndexUrl: user.pipIndexUrl ?? DEFAULTS.pipIndexUrl,
        gitUrl: user.gitUrl ?? DEFAULTS.gitUrl,
        models: user.models ?? DEFAULT_MODELS,
        customNodes: user.customNodes ?? [],
    };
}
