/**
 * install —— 首次部署 ComfyUI（仓库外）：git clone → venv → CPU-only torch → requirements。
 * 幂等：已存在的步骤跳过（clone 目录/venv/python 已装）。
 * 重装策略：--force 删除既有 installDir 重来（慎用）。
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runCommand, venvPython } from "../lib/exec";
import type { ComfyUiConfig } from "../config";

export async function installComfyUi(config: ComfyUiConfig, options: { force?: boolean } = {}): Promise<number> {
    const { installDir, venvName, torchIndexUrl, pipIndexUrl, gitUrl } = config;
    if (options.force === true && existsSync(installDir)) {
        const { rmSync } = await import("node:fs");
        rmSync(installDir, { recursive: true, force: true });
        console.log(`[comfyui-setup] --force 已删除 ${installDir}`);
    }

    // 1. Python 3.10+ 检查
    const python = runCommand("python", ["--version"], { timeoutMs: 15_000 });
    if (python.status !== 0) {
        console.error("[comfyui-setup] 未找到 python（需 3.10+，建议官方安装器）");
        return 2;
    }
    console.log(`[comfyui-setup] python: ${python.stdout.trim() || python.stderr.trim()}`);

    // 2. git clone
    if (!existsSync(join(installDir, "main.py"))) {
        console.log(`[comfyui-setup] 克隆 ComfyUI → ${installDir}（${gitUrl}）`);
        const clone = runCommand("git", ["clone", "--depth", "1", gitUrl, installDir], { timeoutMs: 600_000 });
        if (clone.status !== 0) {
            console.error(`[comfyui-setup] git clone 失败: ${clone.stderr.trim() || clone.stdout.trim()}`);
            return 1;
        }
    } else {
        console.log(`[comfyui-setup] ComfyUI 已存在（跳过 clone）: ${installDir}`);
    }

    // 3. venv
    const py = venvPython(installDir, venvName);
    if (!existsSync(py)) {
        console.log(`[comfyui-setup] 创建 venv（${venvName}）`);
        const venv = runCommand("python", ["-m", "venv", venvName], { cwd: installDir, timeoutMs: 300_000 });
        if (venv.status !== 0) {
            console.error(`[comfyui-setup] venv 创建失败: ${venv.stderr.trim() || venv.stdout.trim()}`);
            return 1;
        }
    } else {
        console.log(`[comfyui-setup] venv 已存在: ${py}`);
    }

    // 4. CUDA torch（有 NVIDIA GPU 时装 cu130 版；requirements.txt 内 torch 无 index，先装 wheel 防拉错版）
    //    无 GPU 时可用 CPU 版（torchIndexUrl 配 cpu index）。检查标准：torch.cuda.is_available()。
    const torchCheck = runCommand(py, ["-c", "import torch; print(torch.cuda.is_available())"], { cwd: installDir, timeoutMs: 60_000 });
    if (torchCheck.status !== 0 || torchCheck.stdout.trim() !== "True") {
        console.log(`[comfyui-setup] 安装 CUDA torch（index-url: ${torchIndexUrl}）`);
        const torch = runCommand(py, ["-m", "pip", "install", "torch", "torchvision", "--index-url", torchIndexUrl], { cwd: installDir, timeoutMs: 900_000 });
        if (torch.status !== 0) {
            console.error(`[comfyui-setup] torch 安装失败: ${torch.stderr.trim() || torch.stdout.trim()}`);
            return 1;
        }
    } else {
        console.log(`[comfyui-setup] CUDA torch 已就绪（cuda=True）`);
    }

    // 5. requirements（镜像可配）
    const reqCheck = runCommand(py, ["-c", "import aiohttp"], { cwd: installDir, timeoutMs: 60_000 });
    if (reqCheck.status !== 0) {
        console.log(`[comfyui-setup] 安装 requirements（pip 镜像: ${pipIndexUrl}）`);
        const req = runCommand(py, ["-m", "pip", "install", "-r", "requirements.txt", "-i", pipIndexUrl], { cwd: installDir, timeoutMs: 900_000 });
        if (req.status !== 0) {
            console.error(`[comfyui-setup] requirements 安装失败: ${req.stderr.trim() || req.stdout.trim()}`);
            return 1;
        }
    } else {
        console.log("[comfyui-setup] requirements 已就绪（aiohttp 可导入）");
    }

    console.log(`[comfyui-setup] install 完成。下一步: comfyui-setup model（下载模型）→ comfyui-setup start`);
    return 0;
}
