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

export type CommandRunner = (
    args: readonly string[],
    options: CommandOptions,
) => Promise<CommandResult>;

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
        if (failure.killed || failure.code === "ETIMEDOUT") throw failure;
        return {
            exitCode: typeof failure.code === "number" ? failure.code : 1,
            stdout: failure.stdout ?? "",
            stderr: failure.stderr ?? failure.message,
        };
    }
};
