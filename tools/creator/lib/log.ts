import { readFileSync } from "node:fs";

/** 睡眠辅助。 */
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 带重试读取文本：Creator 运行时日志文件被独占锁定（Windows EPERM），
 * 等 Creator 退出后读取仍可能瞬时失败，需重试而非一次报错。
 */
export function readTextWithRetry(path: string, retries = 10, delayMs = 500): string {
    for (let i = 0; i < retries; i++) {
        try {
            return readFileSync(path, "utf8");
        } catch {
            if (i === retries - 1) {
                throw new Error(`无法读取（可能仍被 Creator 锁定）: ${path}`);
            }
            // 同步阻塞重试，避免 async 传染给调用方
            const end = Date.now() + delayMs;
            while (Date.now() < end) {
                // busy-wait 保持同步语义
            }
        }
    }
    throw new Error(`读取失败: ${path}`);
}

/**
 * 轮询 collect() 返回文本直到匹配 pattern 或超时。
 * 用于构建日志（"build Task ... Finished"）等异步成功信号。
 */
export async function waitForPattern(collect: () => string, pattern: RegExp, timeoutMs: number, intervalMs = 1000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (pattern.test(collect())) {
            return true;
        }
        await sleep(intervalMs);
    }
    return pattern.test(collect());
}
