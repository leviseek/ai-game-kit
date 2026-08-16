/**
 * start —— 后台启动 ComfyUI（GPU 优先，无 CUDA 时 --cpu），日志落 temp/comfyui/comfyui.log，
 * PID 落 temp/comfyui/comfyui.pid；等待 /system_stats 健康后返回。
 * 已运行（PID 存活且端口可达）时幂等提示。
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runCommand, killPid, readPid, spawnDetached, venvPython } from "../lib/exec";
import type { ComfyUiConfig } from "../config";
import { repoRoot } from "./paths";

const PID_FILE = "comfyui.pid";
const LOG_FILE = "comfyui.log";

/** 探测 venv torch 是否支持 CUDA（GPU 可用则不加 --cpu）。 */
function detectGpu(installDir: string, venvName: string): boolean {
    const py = venvPython(installDir, venvName);
    const result = runCommand(py, ["-c", "import torch; print(torch.cuda.is_available())"], { cwd: installDir, timeoutMs: 30_000 });
    return result.status === 0 && result.stdout.trim() === "True";
}

export async function startComfyUi(config: ComfyUiConfig): Promise<number> {
    const stateDir = join(repoRoot(), "temp", "comfyui");
    mkdirSync(stateDir, { recursive: true });
    const pidFile = join(stateDir, PID_FILE);
    const logFile = join(stateDir, LOG_FILE);

    const existing = readPid(pidFile);
    if (existing !== null && (await healthOk(config.port))) {
        console.log(`[comfyui-setup] ComfyUI 已在运行（pid=${existing}，http://127.0.0.1:${config.port}）`);
        return 0;
    }
    if (existing !== null) {
        // PID 文件残留但服务不可达：清理
        killPid(existing);
    }

    const py = venvPython(config.installDir, config.venvName);
    if (!existsSync(py)) {
        console.error(`[comfyui-setup] venv python 不存在: ${py}（先运行 comfyui-setup install）`);
        return 2;
    }
    const useGpu = detectGpu(config.installDir, config.venvName);
    const args = useGpu
        ? ["main.py", "--port", String(config.port), "--disable-auto-launch"]
        : ["main.py", "--cpu", "--port", String(config.port), "--disable-auto-launch"];
    const child = spawnDetached(py, args, {
        cwd: config.installDir,
        logFile,
        pidFile,
    });
    console.log(`[comfyui-setup] 启动 ComfyUI（pid=${child.pid}，device=${useGpu ? "gpu" : "cpu"}，日志: ${logFile}）`);

    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
        if (await healthOk(config.port)) {
            console.log(`[comfyui-setup] 就绪: http://127.0.0.1:${config.port}（device=${useGpu ? "gpu" : "cpu"}）`);
            return 0;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    console.error(`[comfyui-setup] 启动超时（120s 内 /system_stats 未就绪）；见日志 ${logFile}`);
    return 1;
}

/** 健康检查：GET /system_stats 返回 200。 */
export async function healthOk(port: number): Promise<boolean> {
    try {
        const response = await fetch(`http://127.0.0.1:${port}/system_stats`, { signal: AbortSignal.timeout(3_000) });
        return response.ok;
    } catch {
        return false;
    }
}
