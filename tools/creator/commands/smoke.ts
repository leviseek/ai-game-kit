import { join } from "node:path";
import { flagBool, hasHelp, parseArgs } from "../lib/args";
import { run as runCheckImportMap } from "./check-import-map";
import { run as runBuild } from "./build";
import { runCdpProbe } from "../lib/cdp";
import { serveDir } from "../lib/http";
import { acquireLock, releaseLock } from "../lib/lock";
import { getProjectRoot } from "../lib/env";

export const help =
  "smoke [--debug true] [--scene <uuid|路径>...] —— 端到端冒烟：校验配置 → 构建 → headless Chrome 运行验证";

/**
 * 端到端冒烟编排（组合器，不重复实现原子逻辑）：
 * 1. check-import-map 静态校验（防静默降级）
 * 2. build（内部自带 close + 独占锁）
 * 3. serve build/web-desktop 并 headless Chrome + CDP 收集运行日志
 */
export async function run(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (hasHelp(parsed)) {
    console.log(help);
    return 0;
  }

  if (!acquireLock("smoke")) {
    console.error("[ccc:smoke] 已有冒烟/构建在运行（锁被占用）");
    return 1;
  }

  const debug = flagBool(parsed, "debug", true);

  try {
    console.log("[ccc:smoke] 1/3 校验 importMap 配置...");
    const checkCode = await runCheckImportMap([]);
    if (checkCode !== 0) {
      return checkCode;
    }

    console.log("[ccc:smoke] 2/3 构建 Web Desktop...");
    const buildArgs = [...argv.filter((arg) => arg !== `--debug=${debug}`)];
    if (argv.includes("--debug") === false) {
      buildArgs.push("--debug", String(debug));
    }
    const buildCode = await runBuild(buildArgs);
    if (buildCode !== 0) {
      return buildCode;
    }

    console.log("[ccc:smoke] 3/3 headless Chrome 运行验证...");
    const buildRoot = join(getProjectRoot(), "build", "web-desktop");
    const server = await serveDir(buildRoot);
    try {
      const url = `http://127.0.0.1:${server.port}/index.html`;
      const result = await runCdpProbe(url, 15000);
      console.log("[ccc:smoke] === 页面 console 日志 ===");
      for (const line of result.consoleLogs) {
        console.log(`  ${line}`);
      }
      if (result.errors.length > 0) {
        console.error("[ccc:smoke] === 页面错误 ===");
        for (const error of result.errors) {
          console.error(`  ${error}`);
        }
        return 1;
      }
      console.log("[ccc:smoke] 运行验证通过（页面无 console error）");
      return 0;
    } finally {
      await server.close();
    }
  } finally {
    releaseLock("smoke");
  }
}
