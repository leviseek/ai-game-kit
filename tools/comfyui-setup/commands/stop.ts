/**
 * stop —— 按 PID 文件终止 ComfyUI（Windows 用 taskkill /T 连子进程），清理 PID 文件。
 * 无 PID 文件或进程已不在时幂等。
 */
import { join } from "node:path";
import { killPid, readPid, removeFileIfExists } from "../lib/exec";
import { repoRoot } from "./paths";

export function stopComfyUi(): number {
    const pidFile = join(repoRoot(), "temp", "comfyui", "comfyui.pid");
    const pid = readPid(pidFile);
    if (pid === null) {
        console.log("[comfyui-setup] 无 PID 记录（可能未启动或已停止）");
        return 0;
    }
    const killed = killPid(pid);
    removeFileIfExists(pidFile);
    console.log(killed ? `[comfyui-setup] 已终止 pid=${pid}` : `[comfyui-setup] pid=${pid} 终止失败（可能已退出）`);
    return 0;
}
