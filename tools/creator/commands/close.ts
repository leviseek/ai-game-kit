import { hasHelp, parseArgs } from "../lib/args";
import { closeCreator, isCreatorRunning } from "../lib/proc";
import { sleep } from "../lib/log";

export const help = "close [--wait <秒>] —— 关闭全部 Creator 实例（幂等）";

export async function run(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (hasHelp(parsed)) {
    console.log(help);
    return 0;
  }

  if (!isCreatorRunning()) {
    console.log("[ccc:close] 无运行中的 Creator 实例");
    return 0;
  }

  closeCreator();
  console.log("[ccc:close] 已发送关闭信号");
  await sleep(5000);
  return 0;
}
