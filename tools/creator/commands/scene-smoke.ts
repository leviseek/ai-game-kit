import { join } from "node:path";
import { flagBool, hasHelp, parseArgs } from "../lib/args";
import { run as runCheckImportMap } from "./check-import-map";
import { run as runBuild } from "./build";
import { runCdpProbe } from "../lib/cdp";
import { serveDir } from "../lib/http";
import { acquireLock, releaseLock } from "../lib/lock";
import { getProjectRoot } from "../lib/env";

export const help =
    "scene-smoke [--debug true] —— 场景流转冒烟：构建（含 startup+game 场景）→ headless Chrome 加载 ?smoke=scene-flow 验证预加载/成功切换/失败保留/重试/资源释放闭环";

/**
 * 9.4 场景路径冒烟：复用 ui-smoke 的构建 + headless Chrome + CDP 模式，加载带
 * `?smoke=scene-flow` 参数的 Web Desktop 构建产物。AppRoot 检测该参数后执行
 * 场景流转冒烟序列并输出 `[scene-smoke]` 标记；本命令采集标记与页面错误，
 * 断言关键步骤全部 ok 且无 console error。构建显式包含 startup + game 两个
 * 场景（单向冒烟 startup → game，避免回切实例化第二个 AppRoot）。
 */
export async function run(argv: readonly string[]): Promise<number> {
    const parsed = parseArgs(argv);
    if (hasHelp(parsed)) {
        console.log(help);
        return 0;
    }

    if (!acquireLock("scene-smoke")) {
        console.error("[ccc:scene-smoke] 已有构建/冒烟在运行（锁被占用）");
        return 1;
    }

    const debug = flagBool(parsed, "debug", true);

    try {
        console.log("[ccc:scene-smoke] 1/3 校验 importMap 配置...");
        const checkCode = await runCheckImportMap([]);
        if (checkCode !== 0) {
            return checkCode;
        }

        console.log("[ccc:scene-smoke] 2/3 构建 Web Desktop（startup + game 场景）...");
        const buildArgs = [
            ...argv.filter(
                (arg) => arg !== `--debug=${debug}` && arg !== "--scene",
            ),
            "--debug",
            String(debug),
            "--scene",
            "startup,game",
        ];
        const skipBuild = flagBool(parsed, "skip-build", true);
        const buildCode = skipBuild ? 0 : await runBuild(buildArgs);
        if (buildCode !== 0) {
            return buildCode;
        }

        console.log("[ccc:scene-smoke] 3/3 headless Chrome 运行场景流转冒烟...");
        const buildRoot = join(getProjectRoot(), "build", "web-desktop");
        const server = await serveDir(buildRoot);
        try {
            const url = `http://127.0.0.1:${server.port}/index.html?smoke=scene-flow`;
            const result = await runCdpProbe(url, 20000);

            console.log("[ccc:scene-smoke] === 页面 console 日志 ===");
            for (const line of result.consoleLogs) {
                console.log(`  ${line}`);
            }

            if (result.errors.length > 0) {
                // 失败路径（no-such-bundle）会触发预期的 404 资源加载错误（Log 级
                // "Failed to load resource"），与真实脚本异常（Runtime.exceptionThrown）
                // 不同：前者是故意构造的失败信号，标记已断言保留场景；后者才是失败。
                // 过滤预期 404，剩余错误仍判失败。
                const realErrors = result.errors.filter(
                    (error) => !error.includes("Failed to load resource"),
                );
                if (realErrors.length > 0) {
                    console.error("[ccc:scene-smoke] === 页面错误 ===");
                    for (const error of realErrors) {
                        console.error(`  ${error}`);
                    }
                    return 1;
                }
            }

            const markers = result.consoleLogs.filter((line) =>
                line.startsWith("[scene-smoke]"),
            );
            const required = [
                "entry: ok",
                "initial-can-unload-game: ok",
                "preload: ok",
                "preload-holds-game: ok",
                "release-loop: ok",
                "switch: ok",
                "switch-scene: ok",
                "switch-holds-game: ok",
                "fail-keeps-scene: ok",
                "retry: ok",
                "missing-bundle-noop: ok",
                "complete",
            ];
            const missing = required.filter(
                (needle) => !markers.some((line) => line.includes(needle)),
            );

            if (missing.length > 0) {
                console.error("[ccc:scene-smoke] 冒烟标记不完整，缺少:");
                for (const item of missing) {
                    console.error(`  - ${item}`);
                }
                return 1;
            }

            console.log("[ccc:scene-smoke] 场景流转冒烟验证通过");
            return 0;
        } finally {
            await server.close();
        }
    } finally {
        releaseLock("scene-smoke");
    }
}
