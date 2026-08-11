import { run as runListResources } from "./commands/list-resources";
import { run as runReadComponent } from "./commands/read-component";
import { run as runValidate } from "./commands/validate";
import { run as runNextId } from "./commands/next-id";
import { run as runSprite } from "./commands/sprite";
import { run as runRegisterComponent } from "./commands/register-component";
import { run as runGenConstants } from "./commands/gen-constants";

interface Command {
    readonly run: (argv: readonly string[]) => Promise<number>;
    readonly usage: string;
}

const COMMANDS: Record<string, Command> = {
    "list-resources": {
        run: runListResources,
        usage: "list-resources --package <包名> [--project <工程目录>] 列出包的资源清单",
    },
    "read-component": {
        run: runReadComponent,
        usage: "read-component --package <包名> --component <组件名> [--project <工程目录>] 读取组件结构索引",
    },
    validate: {
        run: runValidate,
        usage: "validate --package <包名> [--component <组件名>] [--project <工程目录>] 校验引用完整性",
    },
    "next-id": {
        run: runNextId,
        usage: "next-id --package <包名> [--prefix <前缀>] [--project <工程目录>] 分配不冲突的资源短 id",
    },
    sprite: {
        run: runSprite,
        usage: "sprite --package <包名> --name <文件.png> --palette <调色板> --art <多行ASCII> [--scale9grid l,t,r,b] [--path <目录>] [--project <工程目录>] 生成像素 PNG 并登记",
    },
    "register-component": {
        run: runRegisterComponent,
        usage: "register-component --package <包名> --name <组件文件.xml> [--path <目录>] [--project <工程目录>] 幂等登记组件（已存在返回原 id）",
    },
    "gen-constants": {
        run: runGenConstants,
        usage: "gen-constants [--project <工程目录>] 生成 exported 组件 URL 常量表到 assets/ui/generated/",
    },
};

function printHelp(): void {
    console.log("fgui —— FairyGUI 确定性工具");
    console.log("");
    console.log("用法: bun run fgui <command> [options]");
    console.log("      bun run fgui -h | --help");
    console.log("");
    console.log("命令:");
    for (const [name, command] of Object.entries(COMMANDS)) {
        console.log(`  ${name.padEnd(16)} ${command.usage}`);
    }
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2);

    if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
        printHelp();
        process.exit(0);
    }

    const name = argv[0];
    const command = COMMANDS[name];
    if (command === undefined) {
        console.error(`未知命令: ${name}`);
        console.error("");
        printHelp();
        process.exit(2);
    }

    const code = await command.run(argv.slice(1));
    process.exit(code);
}

main().catch((error) => {
    console.error(`[fgui] 未预期错误: ${error instanceof Error ? error.stack : String(error)}`);
    process.exit(1);
});
