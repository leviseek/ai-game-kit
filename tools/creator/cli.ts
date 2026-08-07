import { run as runOpen } from "./commands/open";
import { run as runClose } from "./commands/close";
import { run as runBuild } from "./commands/build";
import { run as runTypecheck } from "./commands/typecheck";
import { run as runCheckImportMap } from "./commands/check-import-map";
import { run as runSmoke } from "./commands/smoke";
import { run as runUiSmoke } from "./commands/ui-smoke";
import { run as runUiModalClick } from "./commands/ui-modal-click";

interface Command {
  readonly run: (argv: readonly string[]) => Promise<number>;
  readonly usage: string;
}

const COMMANDS: Record<string, Command> = {
  open: { run: runOpen, usage: "open [--timeout <秒>] 打开项目（--nologin）并等待就绪" },
  close: { run: runClose, usage: "close [--wait <秒>] 关闭全部 Creator 实例" },
  build: {
    run: runBuild,
    usage: "build [--platform web-desktop] [--debug true] [--scene <uuid|路径>...] 构建（自动先关闭实例）",
  },
  typecheck: { run: runTypecheck, usage: "typecheck strict 类型检查（framework + fairygui 接入验证）" },
  "check-import-map": {
    run: runCheckImportMap,
    usage: "check-import-map 校验 importMap 配置（防绝对路径静默降级）",
  },
  smoke: {
    run: runSmoke,
    usage: "smoke [--debug true] [--scene <uuid|路径>...] 端到端冒烟：校验 → 构建 → headless Chrome 运行验证",
  },
  "ui-smoke": {
    run: runUiSmoke,
    usage: "ui-smoke [--debug true] FairyGUI UI 冒烟：构建 → headless Chrome 加载 ?smoke=fairygui-ui 验证 UI 根/页面/遮罩/资源释放",
  },
  "ui-modal-click": {
    run: runUiModalClick,
    usage: "ui-modal-click [--debug true] 模态遮罩真实点击验证：构建 → headless Chrome 注入真实点击断言模态拦截/解除恢复",
  },
};

function printHelp(): void {
  console.log("ccc —— Cocos Creator 3.8 命令行工具");
  console.log("");
  console.log("用法: bun run ccc <command> [options]");
  console.log("      bun run ccc -h | --help");
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
  console.error(`[ccc] 未预期错误: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
