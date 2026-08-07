import { join } from "node:path";
import { flagBool, hasHelp, parseArgs } from "../lib/args";
import { run as runCheckImportMap } from "./check-import-map";
import { run as runBuild } from "./build";
import { runCdpProbe, type CdpSession } from "../lib/cdp";
import { serveDir } from "../lib/http";
import { acquireLock, releaseLock } from "../lib/lock";
import { getProjectRoot } from "../lib/env";
import { sleep } from "../lib/log";

export const help =
  "ui-modal-click —— 模态遮罩命中验证：构建 → headless Chrome 加载 ?smoke=modal-click，应用内 fgui 触摸注入，断言模态期间遮罩拦截（下层不响应）、解除后下层恢复";

// tap/hitIsUnder 均取 GRoot 中心（rootSize 坐标系），坐标由 AppRoot 钩子内部
// 计算，调用方不猜测屏幕/设计分辨率映射。
async function waitForActive(
  cdp: CdpSession,
  expectActive: boolean,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const active = (await cdp.evaluate(
      "window.__modalClick ? window.__modalClick.active() : false",
    )) as boolean;
    if (active === expectActive) {
      return;
    }
    await sleep(200);
  }
  throw new Error(
    `等待模态状态 ${expectActive ? "生效" : "解除"} 超时（${timeoutMs}ms）`,
  );
}

async function hitIsUnder(cdp: CdpSession): Promise<boolean> {
  const value = (await cdp.evaluate(
    "window.__modalClick ? window.__modalClick.hitIsUnder() : null",
  )) as boolean | null;
  return value === true;
}

/** 应用内触摸注入并校验成功（tap 内部未就绪时返回 false）。 */
async function injectTap(cdp: CdpSession): Promise<void> {
  const ok = (await cdp.evaluate(
    "window.__modalClick ? window.__modalClick.tap() : false",
  )) as boolean | null;
  if (ok !== true) {
    throw new Error("应用内触摸注入失败（tap 返回非 true）");
  }
}

/**
 * 0.7 冒烟验证：复用 ui-smoke 的构建 + headless Chrome + CDP 模式，加载带
 * `?smoke=modal-click` 参数的 Web Desktop 构建产物。AppRoot 挂载可点击下层
 * 页面并进入阻断模态后输出 `[modal-click] ready`；本命令经应用内触摸注入
 * （window.__modalClick.tap，驱动 fgui 真实命中逻辑）：
 * 1) 模态期间点击遮罩区域 → 断言 fgui 命中遮罩（下层不响应，不穿透）
 * 2) 解除模态后再次点击 → 断言 fgui 命中下层页面（恢复响应）
 */
export async function run(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (hasHelp(parsed)) {
    console.log(help);
    return 0;
  }

  if (!acquireLock("ui-modal-click")) {
    console.error("[ccc:ui-modal-click] 已有构建/冒烟在运行（锁被占用）");
    return 1;
  }

  const debug = flagBool(parsed, "debug", true);

  try {
    console.log("[ccc:ui-modal-click] 1/3 校验 importMap 配置...");
    const checkCode = await runCheckImportMap([]);
    if (checkCode !== 0) {
      return checkCode;
    }

    console.log("[ccc:ui-modal-click] 2/3 构建 Web Desktop...");
    const buildArgs = [...argv.filter((arg) => arg !== `--debug=${debug}`)];
    if (argv.includes("--debug") === false) {
      buildArgs.push("--debug", String(debug));
    }
    const skipBuild = flagBool(parsed, "skip-build", true);
    const buildCode = skipBuild ? 0 : await runBuild(buildArgs);
    if (buildCode !== 0) {
      return buildCode;
    }

    console.log("[ccc:ui-modal-click] 3/3 headless Chrome 模态命中验证...");
    const buildRoot = join(getProjectRoot(), "build", "web-desktop");
    const server = await serveDir(buildRoot);
    try {
      const url = `http://127.0.0.1:${server.port}/index.html?smoke=modal-click`;

      // 模态期间点击是否被遮罩拦截、解除后下层是否恢复，由交互回调断言；
      // 失败经 runCdpProbe 记录到 errors
      let interactError: string | undefined;
      const result = await runCdpProbe(url, 6000, async (cdp) => {
        try {
          // headless 页面默认无焦点：CDP Input 合成事件只触发 pointer 而不产生
          // mousedown，Cocos Web 构建在 headless 下 canvas 监听后 Input 单例不
          // 转发到节点事件系统（引擎输入链路受限），故 fgui 命中验证改用应用内
          // 触摸注入（window.__modalClick.tap，向 GRoot 根节点派发 cc 触摸流，
          // 经 fgui 真实命中/遮罩拦截逻辑处理）
          await cdp.send("Page.bringToFront");
          await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });

          await waitForActive(cdp, true, 15000);
          console.log("[ccc:ui-modal-click] 模态已生效");

          // 模态期间应用内触摸：fgui 命中遮罩，下层页面不响应（不穿透）
          await injectTap(cdp);
          if (await hitIsUnder(cdp)) {
            throw new Error("模态期间点击穿透到下层页面，遮罩未拦截");
          }
          console.log("[ccc:ui-modal-click] 模态期间点击命中遮罩（下层不响应）");

          await cdp.evaluate("window.__modalClick.clear()");
          await waitForActive(cdp, false, 5000);
          console.log("[ccc:ui-modal-click] 模态已解除");

          // 解除后应用内触摸：fgui 命中下层页面，恢复响应
          await injectTap(cdp);
          if (!(await hitIsUnder(cdp))) {
            throw new Error("解除后点击未命中下层页面，未恢复响应");
          }
          console.log("[ccc:ui-modal-click] 解除后点击命中下层页面（恢复）");
        } catch (error) {
          interactError =
            error instanceof Error ? error.message : String(error);
          throw error;
        }
      });

      console.log("[ccc:ui-modal-click] === 页面 console 日志 ===");
      for (const line of result.consoleLogs) {
        console.log(`  ${line}`);
      }

      if (interactError !== undefined) {
        console.error(`[ccc:ui-modal-click] 命中断言失败: ${interactError}`);
        return 1;
      }
      if (result.errors.length > 0) {
        console.error("[ccc:ui-modal-click] === 页面错误 ===");
        for (const error of result.errors) {
          console.error(`  ${error}`);
        }
        return 1;
      }

      const markers = result.consoleLogs.filter((line) =>
        line.startsWith("[modal-click]"),
      );
      const required = [
        "ui-root-init: ok",
        "under-mounted: ok",
        "modal-active: ok",
        "ready",
      ];
      const missing = required.filter(
        (needle) => !markers.some((line) => line.includes(needle)),
      );
      if (missing.length > 0) {
        console.error("[ccc:ui-modal-click] 冒烟标记不完整，缺少:");
        for (const item of missing) {
          console.error(`  - ${item}`);
        }
        return 1;
      }

      console.log("[ccc:ui-modal-click] 模态遮罩命中验证通过");
      return 0;
    } finally {
      await server.close();
    }
  } finally {
    releaseLock("ui-modal-click");
  }
}
