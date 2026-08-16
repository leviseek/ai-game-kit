/**
 * comfyui-setup —— ComfyUI 部署工具链（仓库外安装，本工具只编排）。
 *
 * 子命令：
 *   install [--force]                  部署：python 检查 → git clone → venv → CPU torch → requirements
 *   model [--id <id>] [--threads N]    按配置清单下载模型权重（多线程分片，幂等跳过）
 *   start                              后台启动服务（--cpu --port，日志/PID 落 temp/comfyui/）
 *   stop                               按 PID 终止服务
 *   status                             查询运行状态（/system_stats）
 *
 * 通用: --config <path> 覆盖 comfyui.config.json。
 * ComfyUI 本体与模型权重永远在仓库外（见 config.installDir），本工具只提供可复现部署。
 */
import { flagString, hasHelp, parseArgs } from "./lib/args";
import { loadConfig } from "./config";
import { installComfyUi } from "./commands/install";
import { downloadModel } from "./commands/model";
import { startComfyUi } from "./commands/start";
import { stopComfyUi } from "./commands/stop";
import { statusComfyUi } from "./commands/status";

export const help = "comfyui-setup —— ComfyUI 部署工具链：install/model/start/stop/status（ComfyUI 本体在仓库外，本工具只编排部署）";

export async function run(argv: readonly string[]): Promise<number> {
    if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
        console.log(help);
        return 0;
    }
    const [subcommand, ...rest] = argv;
    const parsed = parseArgs(rest);
    if (hasHelp(parsed)) {
        console.log(help);
        return 0;
    }
    const config = loadConfig(flagString(parsed, "config"));
    switch (subcommand) {
        case "install":
            return installComfyUi(config, { force: parsed.flags.get("force") === true });
        case "model":
            return downloadModel(config, { id: flagString(parsed, "id"), threads: numberFlag(parsed, "threads") });
        case "start":
            return startComfyUi(config);
        case "stop":
            return stopComfyUi();
        case "status":
            return statusComfyUi(config);
        default:
            console.error(`[comfyui-setup] 未知子命令: ${subcommand}`);
            return 2;
    }
}

function numberFlag(parsed: ReturnType<typeof parseArgs>, name: string): number | undefined {
    const value = flagString(parsed, name);
    if (value === undefined) return undefined;
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? Math.floor(num) : undefined;
}

// 直接执行（bun ./tools/comfyui-setup/cli.ts）时入口
if (import.meta.main) {
    process.exitCode = await run(process.argv.slice(2));
}
