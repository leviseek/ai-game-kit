import { execFile } from "node:child_process";
import { promisify } from "node:util";

export interface CommandOptions {
    readonly timeoutMs: number;
    readonly maxBuffer: number;
}

export interface CommandResult {
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
}

export type CommandRunner = (args: readonly string[], options: CommandOptions) => Promise<CommandResult>;

interface ExecFileFailure extends Error {
    readonly code?: string | number | null;
    readonly killed?: boolean;
    readonly stdout?: string;
    readonly stderr?: string;
}

const execFileAsync = promisify(execFile);

/**
 * 进程层固定调用公开的 codegraph 可执行文件；参数保持数组形态，避免 shell 解析。
 */
export const runCodeGraphCommand: CommandRunner = async (args, options) => {
    try {
        const result = await execFileAsync("codegraph", [...args], {
            encoding: "utf8",
            timeout: options.timeoutMs,
            maxBuffer: options.maxBuffer,
            windowsHide: true,
        });
        return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
        const failure = error as ExecFileFailure;
        // 命令不存在（ENOENT）：给出可执行指引，避免换机/CI 下晦涩失败
        // （P1-4：codegraph 为全局二进制，需显式安装/版本固定）
        if (failure.code === "ENOENT") {
            throw new Error("codegraph CLI 未安装或不在 PATH：请先运行 `npm i -g codegraph`（或 bun i -g codegraph），" + "版本要求 ≥ 1.5，并确认 `codegraph init` 已初始化 .codegraph 索引");
        }
        if (failure.killed || failure.code === "ETIMEDOUT") throw failure;
        return {
            exitCode: typeof failure.code === "number" ? failure.code : 1,
            stdout: failure.stdout ?? "",
            stderr: failure.stderr ?? failure.message,
        };
    }
};
