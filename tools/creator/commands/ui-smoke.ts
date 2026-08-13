import { join } from "node:path";
import { flagBool, hasHelp, parseArgs } from "../lib/args";
import { run as runCheckImportMap } from "./check-import-map";
import { run as runBuild } from "./build";
import { runCdpProbe } from "../lib/cdp";
import { serveDir } from "../lib/http";
import { acquireLock, releaseLock } from "../lib/lock";
import { getProjectRoot } from "../lib/env";

export const help = "ui-smoke —— FairyGUI UI 冒烟：校验 → 构建 → headless Chrome 加载 ?smoke=fairygui-ui 验证 UI 根/页面/遮罩/资源释放闭环";

/**
 * 4.2 冒烟验证：复用 6.2 的 headless Chrome + CDP 模式，加载带
 * `?smoke=fairygui-ui` 参数的 Web Desktop 构建产物。AppRoot 检测该参数后
 * 执行完整 UI 冒烟序列并输出 `[ui-smoke]` 标记；本命令采集标记与页面错误，
 * 断言关键步骤全部 ok 且无 console error。
 */
export async function run(argv: readonly string[]): Promise<number> {
    const parsed = parseArgs(argv);
    if (hasHelp(parsed)) {
        console.log(help);
        return 0;
    }

    if (!acquireLock("ui-smoke")) {
        console.error("[ccc:ui-smoke] 已有构建/冒烟在运行（锁被占用）");
        return 1;
    }

    const debug = flagBool(parsed, "debug", true);

    try {
        console.log("[ccc:ui-smoke] 1/3 校验 importMap 配置...");
        const checkCode = await runCheckImportMap([]);
        if (checkCode !== 0) {
            return checkCode;
        }

        console.log("[ccc:ui-smoke] 2/3 构建 Web Desktop...");
        const buildArgs = [...argv.filter((arg) => arg !== `--debug=${debug}`)];
        if (argv.includes("--debug") === false) {
            buildArgs.push("--debug", String(debug));
        }
        const buildCode = await runBuild(buildArgs);
        if (buildCode !== 0) {
            return buildCode;
        }

        console.log("[ccc:ui-smoke] 3/3 headless Chrome 运行 UI 冒烟...");
        const buildRoot = join(getProjectRoot(), "build", "web-desktop");
        const server = await serveDir(buildRoot);
        try {
            const url = `http://127.0.0.1:${server.port}/index.html?smoke=fairygui-ui`;
            const result = await runCdpProbe(url, 20000);

            console.log("[ccc:ui-smoke] === 页面 console 日志 ===");
            for (const line of result.consoleLogs) {
                console.log(`  ${line}`);
            }

            if (result.errors.length > 0) {
                console.error("[ccc:ui-smoke] === 页面错误 ===");
                for (const error of result.errors) {
                    console.error(`  ${error}`);
                }
                return 1;
            }

            // 断言冒烟标记完整且关键步骤通过
            const markers = result.consoleLogs.filter((line) => line.startsWith("[ui-smoke]"));
            const required = [
                "ui-root-init: ok",
                "package-load: ok",
                "page-open: ok",
                "modal-show: ok",
                "modal-hide: ok",
                "page-close: ok",
                "resource-release: ok",
                "missing-package-noop: ok",
                "complete",
            ];
            const missing = required.filter((needle) => !markers.some((line) => line.includes(needle)));

            if (missing.length > 0) {
                console.error("[ccc:ui-smoke] 冒烟标记不完整，缺少:");
                for (const item of missing) {
                    console.error(`  - ${item}`);
                }
                return 1;
            }

            console.log("[ccc:ui-smoke] UI 冒烟验证通过");
            return 0;
        } finally {
            await server.close();
        }
    } finally {
        releaseLock("ui-smoke");
    }
}
