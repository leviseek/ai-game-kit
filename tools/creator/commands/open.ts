import { flagNumber, hasHelp, parseArgs } from "../lib/args";
import { findCreatorExe, getProjectName, getProjectRoot } from "../lib/env";
import { isCreatorReady, runPowershell } from "../lib/proc";
import { sleep } from "../lib/log";

export const help = "open [--timeout <秒>] —— 打开项目（--nologin）并等待就绪";

export async function run(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (hasHelp(parsed)) {
    console.log(help);
    return 0;
  }

  const projectName = getProjectName();
  if (isCreatorReady(projectName)) {
    console.log(`[ccc:open] Creator 已就绪（${projectName}）`);
    return 0;
  }

  const timeoutMs = flagNumber(parsed, "timeout", 120) * 1000;
  const exe = findCreatorExe();
  const project = getProjectRoot();

  // 经 Start-Process 启动，使 Creator 脱离当前进程树（避免随命令结束被清理）
  runPowershell(
    `Start-Process -FilePath '${exe}' -ArgumentList '--nologin','--project','${project}' -WorkingDirectory '${exe.replace(/CocosCreator\.exe$/, "")}'`,
  );

  console.log(`[ccc:open] 启动 Creator: ${exe}`);
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await sleep(5000);
    if (isCreatorReady(projectName, t0)) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[ccc:open] 项目就绪（${elapsed}s）`);
      return 0;
    }
  }

  console.error(`[ccc:open] 超时：${timeoutMs / 1000}s 内项目未就绪`);
  console.error("提示：确认启动参数含 --nologin（否则卡登录页）且 Creator 可正常打开");
  return 1;
}
