/**
 * ai-sync 入口：AI 协作资产（skills/commands/agents）单一来源同步工具。
 *
 * 用法：bun run ai-sync <check|sync|doctor> [options]
 *   check   —— 校验受管文件与 registry 逐字一致（非零退出）
 *   sync    —— 同步 registry → 各工具目录（默认 dry-run，--apply 落盘）
 *   doctor  —— 漂移全量诊断（缺失/过期/多余/空目录/结构问题）
 */
import { run as runCheck } from "./commands/check";
import { run as runSync } from "./commands/sync";
import { run as runDoctor } from "./commands/doctor";

interface Command {
    readonly run: (argv: readonly string[]) => number;
    readonly usage: string;
}

const COMMANDS: Record<string, Command> = {
    check: { run: runCheck, usage: "check —— 校验受管文件与 registry 逐字一致" },
    sync: { run: runSync, usage: "sync [--apply] —— 同步 registry → 工具目录（默认 dry-run）" },
    doctor: { run: runDoctor, usage: "doctor —— 漂移全量诊断" },
};

function printHelp(): void {
    console.log("ai-sync —— AI 协作资产单一来源工具");
    console.log("");
    console.log("用法: bun run ai-sync <command> [options]");
    console.log("      bun run ai-sync -h | --help");
    console.log("");
    console.log("命令:");
    for (const [name, cmd] of Object.entries(COMMANDS)) {
        console.log(`  ${name.padEnd(8)} ${cmd.usage}`);
    }
}

const [command, ...rest] = process.argv.slice(2);
if (!command || command === "-h" || command === "--help") {
    printHelp();
    process.exit(command ? 0 : 1);
}
const cmd = COMMANDS[command];
if (!cmd) {
    console.error(`[ai-sync] 未知命令: "${command}"`);
    printHelp();
    process.exit(1);
}
process.exit(cmd.run(rest));
