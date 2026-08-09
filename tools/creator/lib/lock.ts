import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getCreatorTempDir } from "./env";

/**
 * 文件锁：防止多个会话并行操作同一项目（并行构建会写坏 build/temp）。
 * Windows 上 mkdir 已存在目录即抛错，天然可作为原子锁。
 * 锁内记录持有者 PID；进程异常退出后留下僵尸锁，下次 acquire 时检测
 * PID 不存活则自动清除（避免"中断一次后永远被锁"）。
 */

function lockDir(name: string): string {
    return join(getCreatorTempDir(), "locks", `${name}.lock`);
}

function isPidAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function isZombieLock(dir: string): boolean {
    const pidFile = join(dir, "pid");
    if (!existsSync(pidFile)) {
        // 无 PID 记录的旧锁视为僵尸（本实现之前未写 PID）
        return true;
    }
    const pid = Number(readFileSync(pidFile, "utf8"));
    return !Number.isFinite(pid) || !isPidAlive(pid);
}

export function acquireLock(name: string): boolean {
    const locksRoot = join(getCreatorTempDir(), "locks");
    mkdirSync(locksRoot, { recursive: true });

    const dir = lockDir(name);
    if (existsSync(dir)) {
        if (!isZombieLock(dir)) {
            return false;
        }
        rmSync(dir, { recursive: true, force: true });
    }

    try {
        mkdirSync(dir);
        writeFileSync(join(dir, "pid"), String(process.pid), "utf8");
        return true;
    } catch {
        return false;
    }
}

export function releaseLock(name: string): void {
    rmSync(lockDir(name), { recursive: true, force: true });
}
