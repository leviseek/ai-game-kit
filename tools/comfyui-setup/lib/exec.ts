/**
 * 进程执行封装（零依赖）：同步命令 + 异步后台启动。
 * 后台启动：detached spawn + PID/日志文件，供 start/stop 管理生命周期。
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export interface RunResult {
    readonly status: number;
    readonly stdout: string;
    readonly stderr: string;
}

/** 同步执行命令，返回聚合输出（不吞输出流，便于测试断言）。 */
export function runCommand(command: string, args: readonly string[], options: { cwd?: string; timeoutMs?: number } = {}): RunResult {
    const result = spawnSync(command, args, {
        cwd: options.cwd,
        timeout: options.timeoutMs ?? 300_000,
        encoding: "utf8",
    });
    return {
        status: result.status ?? 1,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
    };
}

/** venv 内 python 可执行文件路径（Windows 下 venv\Scripts\python.exe）。 */
export function venvPython(installDir: string, venvName: string): string {
    return join(installDir, venvName, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
}

/** 后台启动进程：日志追加到 logFile，PID 写 pidFile；返回 child。 */
export function spawnDetached(command: string, args: readonly string[], options: { cwd: string; logFile: string; pidFile: string }): ChildProcess {
    const child = spawn(command, args, {
        cwd: options.cwd,
        // detached: 全平台 true——Windows 下 false 会把子进程放进父进程 job object，
        // start 命令退出（或超时被终止）时 ComfyUI 会被连带杀死；独立进程组才能存活。
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
    });
    child.stdout?.on("data", (chunk: Buffer) => appendFileSync(options.logFile, chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => appendFileSync(options.logFile, chunk.toString()));
    child.on("error", (error: Error) => appendFileSync(options.logFile, `[comfyui-setup] spawn error: ${error.message}\n`));
    writeFileSync(options.pidFile, String(child.pid ?? -1), "utf8");
    return child;
}

/** 读取 PID 文件；缺失或非法返回 null。 */
export function readPid(pidFile: string): number | null {
    if (!existsSync(pidFile)) return null;
    try {
        const pid = Number.parseInt(readFileSync(pidFile, "utf8").trim(), 10);
        return Number.isFinite(pid) && pid > 0 ? pid : null;
    } catch {
        return null;
    }
}

/** 按 PID 终止进程（Windows 用 taskkill /T 连子进程；失败静默）。 */
export function killPid(pid: number): boolean {
    try {
        if (process.platform === "win32") {
            runCommand("taskkill", ["/PID", String(pid), "/T", "/F"], { timeoutMs: 15_000 });
        } else {
            process.kill(pid, "SIGTERM");
        }
        return true;
    } catch {
        return false;
    }
}

export function removeFileIfExists(file: string): void {
    if (existsSync(file)) rmSync(file, { force: true });
}
