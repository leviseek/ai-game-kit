/**
 * content 入口：内容管线确定性工具（配置 schema/引用/文本校验 + i18n 生成）。
 *
 * 用法：bun run content <validate|gen-i18n> [options]
 *   validate —— 校验 assets/game-content 下配置（schema/跨表引用/id 唯一/内嵌文本禁令 + i18n 完整性）
 *   gen-i18n —— 生成 assets/game-content/generated/i18n.ts（key 联合类型 + TextRepo + 主语言默认值）
 */
import { run as runValidate } from "./commands/validate";
import { run as runGenI18n } from "./commands/gen-i18n";
import { run as runAssetgen, registerBuiltinGenerators } from "./commands/assetgen";

interface Command {
    readonly run: (argv: readonly string[]) => number | Promise<number>;
    readonly usage: string;
}

const COMMANDS: Record<string, Command> = {
    validate: { run: runValidate, usage: "validate —— 配置 schema/引用/文本 + i18n 完整性校验" },
    "gen-i18n": { run: runGenI18n, usage: "gen-i18n —— 生成 generated/i18n.ts（key 联合 + TextRepo）" },
    assetgen: { run: runAssetgen, usage: "assetgen <generate|validate|ingest> —— 外部生成器产物接入（staging → 校验 → 登记）" },
};

function printHelp(): void {
    console.log("content —— 内容管线确定性工具");
    console.log("");
    console.log("用法: bun run content <command> [options]");
    console.log("      bun run content -h | --help");
    console.log("");
    console.log("命令:");
    for (const [name, cmd] of Object.entries(COMMANDS)) {
        console.log(`  ${name.padEnd(10)} ${cmd.usage}`);
    }
}

async function main(): Promise<void> {
    registerBuiltinGenerators();
    const argv = process.argv.slice(2);
    if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
        printHelp();
        process.exit(0);
    }
    const name = argv[0];
    const command = COMMANDS[name];
    if (command === undefined) {
        console.error(`未知命令: ${name}`);
        printHelp();
        process.exit(2);
    }
    process.exit(await command.run(argv.slice(1)));
}

void main();
