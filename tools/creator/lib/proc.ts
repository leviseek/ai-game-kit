import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { join } from "node:path";
import { getProjectRoot } from "./env";

/**
 * Windows 进程控制：Creator 实例查询/关闭。
 * 就绪判定用编程系统产物更新（窗口标题在 --nologin 无 GUI 时不可靠）。
 */

const PS = process.env.POWERSHELL_PATH ?? "powershell.exe";

export function runPowershell(script: string): string {
    return execFileSync(PS, ["-NoProfile", "-NonInteractive", "-Command", script], {
        encoding: "utf8",
    }).trim();
}

export function isCreatorRunning(): boolean {
    const count = runPowershell("(Get-Process -Name CocosCreator -ErrorAction SilentlyContinue).Count");
    return Number(count) > 0;
}

/** 编程系统产物最近更新过（ms 内），视为项目已完成一轮编译加载。 */
function isProgrammingFresh(maxAgeMs: number): boolean {
    const marker = join(getProjectRoot(), "temp", "programming", "packer-driver", "targets", "preview", "import-map.json");
    try {
        return Date.now() - statSync(marker).mtimeMs < maxAgeMs;
    } catch {
        return false;
    }
}

/** 编程系统产物在 sinceMs 之后更新过，证明"本次"实例完成过编译。 */
function isProgrammingUpdatedSince(sinceMs: number): boolean {
    const marker = join(getProjectRoot(), "temp", "programming", "packer-driver", "targets", "preview", "import-map.json");
    try {
        return statSync(marker).mtimeMs > sinceMs;
    } catch {
        return false;
    }
}

/**
 * 项目就绪判定：
 * - 无 sinceMs（幂等检查/外部调用）：Creator 在运行且编程产物新鲜（最近 60s 更新过）
 * - 有 sinceMs（open 启动后轮询）：Creator 在运行且编程产物在启动之后更新过（证明本次实例加载完成）
 */
export function isCreatorReady(projectName: string, sinceMs?: number): boolean {
    if (!isCreatorRunning()) {
        return false;
    }
    return sinceMs === undefined ? isProgrammingFresh(60000) : isProgrammingUpdatedSince(sinceMs);
}

/** 关闭全部 Creator 实例（当前单项目仓库的合理默认），幂等。 */
export function closeCreator(): void {
    try {
        runPowershell("Get-Process -Name CocosCreator -ErrorAction SilentlyContinue | Stop-Process -Force");
    } catch {
        // 进程可能恰好已退出（Stop-Process 报非零退出码），关闭目标是"不再有实例"，此处可容忍
    }
}

/** 生成仅清理指定 user-data-dir 的 chrome 进程命令（避免误杀用户浏览器）。 */
export function buildKillChromeCommand(profileDir: string): string {
    return `Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" | Where-Object { $_.CommandLine -match '${profileDir.replaceAll("\\", "\\\\")}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
}

/** 仅清理指定 user-data-dir 的 chrome 进程，避免误杀用户浏览器。 */
export function killChromeByProfile(profileDir: string): void {
    try {
        runPowershell(buildKillChromeCommand(profileDir));
    } catch {
        // 无匹配进程时 PowerShell 管道可能报非零退出码，清理目标已达成即可容忍
    }
}
