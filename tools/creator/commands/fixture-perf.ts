import { join } from "node:path";
import { flagBool, flagString, hasHelp, parseArgs } from "../lib/args";
import { run as runCheckImportMap } from "./check-import-map";
import { run as runBuild } from "./build";
import { runCdpProbe } from "../lib/cdp";
import { serveDir } from "../lib/http";
import { acquireLock, releaseLock } from "../lib/lock";
import { getProjectRoot } from "../lib/env";

export const help =
  "fixture-perf [--fixture <品类>|all] [--debug true] —— 品类夹具基础性能检查：构建 → headless Chrome 加载 ?fixture-perf=<品类> 经 Cocos Profiler 采样 FPS/帧时/逻辑/绘制/内存并断言采样成立";

/** 五类夹具：顺序与 registry.ts 对齐。 */
const FIXTURE_IDS = ["rpg", "card", "idle", "tycoon", "fight"] as const;

// 每类夹具一个独立页面加载；性能序列含 3s 采样窗口 + 生命周期，等待窗口给足余量。
const FIXTURE_TIMEOUT_MS = 25000;

/**
 * 9.5 品类夹具基础性能检查：复用 fixture-smoke 的构建 + headless Chrome + CDP
 * 模式，加载带 `?fixture-perf=<品类>` 参数的 Web Desktop 构建产物。AppRoot 经
 * Cocos Profiler 读取 `profiler.stats` 提供采样器，游戏层 runFixturePerf 驱动
 * start → 采样窗口 → pause → resume → dispose 并输出 `[fixture-perf]` 标记。
 * 本命令对每类夹具断言生命周期各步 ok、采样数 > 0 且各指标标记完整、无 console
 * error；采样数值本身不做硬阈值断言（headless 环境下 FPS 受软渲染影响），数据
 * 用于记录与判断是否存在需要池化/缓存的实测热点。
 */
export async function run(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (hasHelp(parsed)) {
    console.log(help);
    return 0;
  }

  if (!acquireLock("fixture-perf")) {
    console.error("[ccc:fixture-perf] 已有构建/冒烟在运行（锁被占用）");
    return 1;
  }

  const debug = flagBool(parsed, "debug", true);
  const fixtureArg = flagString(parsed, "fixture", "all") ?? "all";
  const fixtureIds =
    fixtureArg === "all"
      ? [...FIXTURE_IDS]
      : fixtureArg
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);

  try {
    console.log("[ccc:fixture-perf] 1/3 校验 importMap 配置...");
    const checkCode = await runCheckImportMap([]);
    if (checkCode !== 0) {
      return checkCode;
    }

    console.log("[ccc:fixture-perf] 2/3 构建 Web Desktop...");
    const buildArgs = [...argv.filter((arg) => arg !== `--debug=${debug}`)];
    if (argv.includes("--debug") === false) {
      buildArgs.push("--debug", String(debug));
    }
    const skipBuild = flagBool(parsed, "skip-build", true);
    const buildCode = skipBuild ? 0 : await runBuild(buildArgs);
    if (buildCode !== 0) {
      return buildCode;
    }

    console.log("[ccc:fixture-perf] 3/3 headless Chrome 运行品类性能检查...");
    const buildRoot = join(getProjectRoot(), "build", "web-desktop");
    const server = await serveDir(buildRoot);
    try {
      let failed = false;

      for (const fixtureId of fixtureIds) {
        console.log(`[ccc:fixture-perf] --- 品类: ${fixtureId} ---`);
        const url = `http://127.0.0.1:${server.port}/index.html?fixture-perf=${fixtureId}`;
        const result = await runCdpProbe(url, FIXTURE_TIMEOUT_MS);

        console.log(`[ccc:fixture-perf] [${fixtureId}] === 页面 console 日志 ===`);
        for (const line of result.consoleLogs) {
          console.log(`  ${line}`);
        }

        if (result.errors.length > 0) {
          console.error(`[ccc:fixture-perf] [${fixtureId}] === 页面错误 ===`);
          for (const error of result.errors) {
            console.error(`  ${error}`);
          }
          failed = true;
          continue;
        }

        const markers = result.consoleLogs.filter((line) =>
          line.startsWith("[fixture-perf]"),
        );
        const required = [
          "fixture-found: ok",
          "start: ok",
          "samples: ok",
          "fps: avg=",
          "frame-ms: avg=",
          "logic-ms: avg=",
          "draws: avg=",
          "texture-memory-mb: avg=",
          "buffer-memory-mb: avg=",
          "pause: ok",
          "resume: ok",
          "dispose: ok",
          "complete",
        ];
        const missing = required.filter(
          (needle) => !markers.some((line) => line.includes(needle)),
        );

        if (missing.length > 0) {
          console.error(`[ccc:fixture-perf] [${fixtureId}] 性能标记不完整，缺少:`);
          for (const item of missing) {
            console.error(`  - ${item}`);
          }
          failed = true;
        }
      }

      if (failed) {
        return 1;
      }

      console.log("[ccc:fixture-perf] 品类夹具性能检查验证通过");
      return 0;
    } finally {
      await server.close();
    }
  } finally {
    releaseLock("fixture-perf");
  }
}
