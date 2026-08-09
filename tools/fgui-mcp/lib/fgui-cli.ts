/**
 * tools/fgui CLI 透传层：MCP 工具把 XML 生成/校验等确定性操作委托给
 * `bun run fgui <command>` 子进程执行（spec：XML generation and validation remain the CLI's authority）。
 * MCP 自身不实现任何 XML 解析/生成逻辑。
 */

import { execFileSync } from "node:child_process";
import { FguiMcpError, PROJECT_ROOT } from "./paths";

export interface CliRunResult {
    /** 进程退出码（0 = 成功） */
    readonly exitCode: number;
    /** stdout 全文 */
    readonly stdout: string;
    /** stderr 全文 */
    readonly stderr: string;
}

export interface CliRunOptions {
    /** 工作目录（默认仓库根，保证 bun run fgui 可解析 workspace） */
    readonly cwd?: string;
}

/**
 * 执行 `bun run fgui <args...>` 并捕获输出。
 * 透传失败（命令缺失/进程异常）抛 FguiMcpError；业务失败（exitCode != 0）返回结果供上层判定。
 */
export function runFguiCli(args: readonly string[], options: CliRunOptions = {}): CliRunResult {
    const cwd = options.cwd ?? PROJECT_ROOT;
    try {
        const stdout = execFileSync("bun", ["run", "fgui", ...args], {
            cwd,
            encoding: "utf8",
            maxBuffer: 64 * 1024 * 1024,
        });
        return { exitCode: 0, stdout, stderr: "" };
    } catch (e) {
        const err = e as { status?: number; stdout?: string; stderr?: string };
        if (typeof err.status === "number") {
            return { exitCode: err.status, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
        }
        throw new FguiMcpError(`fgui CLI 执行失败: ${String(e)}`);
    }
}
