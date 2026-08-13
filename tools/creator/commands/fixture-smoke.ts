import { join } from "node:path";
import { flagBool, flagString, hasHelp, parseArgs } from "../lib/args";
import { run as runCheckImportMap } from "./check-import-map";
import { run as runBuild } from "./build";
import { runCdpProbe } from "../lib/cdp";
import { serveDir } from "../lib/http";
import { acquireLock, releaseLock } from "../lib/lock";
import { getProjectRoot } from "../lib/env";

export const help =
    "fixture-smoke [--fixture <品类>|all] [--debug true] —— 品类夹具冒烟：构建 → headless Chrome 加载 ?fixture=<品类> 验证统一生命周期（start/pause/resume/failRollback/dispose）与音频降级路径，覆盖退出路径";

/** 五类夹具：顺序与 registry.ts 对齐。 */
const FIXTURE_IDS = ["rpg", "card", "idle", "tycoon", "fight"] as const;

// 每类夹具一个独立页面加载；页面在 AppRoot.start 延迟 1s 后执行冒烟序列，
// 序列为快速纯逻辑（无真实引擎加载），等待窗口给足余量。
const FIXTURE_TIMEOUT_MS = 15000;

/**
 * 9.4 品类夹具冒烟：复用 ui-smoke 的构建 + headless Chrome + CDP 模式，加载带
 * `?fixture=<品类>` 参数的 Web Desktop 构建产物。AppRoot 薄转发到游戏层
 * `runFixtureSmoke`，对每个夹具驱动 start → pause → resume → failRollback →
 * dispose 统一生命周期，并对暴露 audio 能力的夹具（fight）报告降级路径。
 * 本命令对每类夹具单独采集 `[fixture-smoke]` 标记，断言关键步骤全 ok、含音频
 * 降级标记的夹具 degraded=true 且无 console error。
 */
export async function run(argv: readonly string[]): Promise<number> {
    const parsed = parseArgs(argv);
    if (hasHelp(parsed)) {
        console.log(help);
        return 0;
    }

    if (!acquireLock("fixture-smoke")) {
        console.error("[ccc:fixture-smoke] 已有构建/冒烟在运行（锁被占用）");
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
        console.log("[ccc:fixture-smoke] 1/3 校验 importMap 配置...");
        const checkCode = await runCheckImportMap([]);
        if (checkCode !== 0) {
            return checkCode;
        }

        console.log("[ccc:fixture-smoke] 2/3 构建 Web Desktop...");
        const buildArgs = [...argv.filter((arg) => arg !== `--debug=${debug}`)];
        if (argv.includes("--debug") === false) {
            buildArgs.push("--debug", String(debug));
        }
        const skipBuild = flagBool(parsed, "skip-build", true);
        const buildCode = skipBuild ? 0 : await runBuild(buildArgs);
        if (buildCode !== 0) {
            return buildCode;
        }

        console.log("[ccc:fixture-smoke] 3/3 headless Chrome 运行品类夹具冒烟...");
        const buildRoot = join(getProjectRoot(), "build", "web-desktop");
        const server = await serveDir(buildRoot);
        try {
            let failed = false;

            for (const fixtureId of fixtureIds) {
                console.log(`[ccc:fixture-smoke] --- 品类: ${fixtureId} ---`);
                const url = `http://127.0.0.1:${server.port}/index.html?fixture=${fixtureId}`;
                const result = await runCdpProbe(url, FIXTURE_TIMEOUT_MS);

                console.log(`[ccc:fixture-smoke] [${fixtureId}] === 页面 console 日志 ===`);
                for (const line of result.consoleLogs) {
                    console.log(`  ${line}`);
                }

                if (result.errors.length > 0) {
                    console.error(`[ccc:fixture-smoke] [${fixtureId}] === 页面错误 ===`);
                    for (const error of result.errors) {
                        console.error(`  ${error}`);
                    }
                    failed = true;
                    continue;
                }

                const markers = result.consoleLogs.filter((line) => line.startsWith("[fixture-smoke]"));
                const required = ["fixture-found: ok", "start: ok", "pause: ok", "resume: ok", "failRollback: ok", "dispose: ok"];
                // 音频降级标记仅对暴露 audio 能力的夹具（fight）出现
                if (fixtureId === "fight") {
                    required.push("audio-degraded: ok");
                }
                const missing = required.filter((needle) => !markers.some((line) => line.includes(needle)));

                if (missing.length > 0) {
                    console.error(`[ccc:fixture-smoke] [${fixtureId}] 冒烟标记不完整，缺少:`);
                    for (const item of missing) {
                        console.error(`  - ${item}`);
                    }
                    failed = true;
                }
            }

            if (failed) {
                return 1;
            }

            console.log("[ccc:fixture-smoke] 品类夹具冒烟验证通过");
            return 0;
        } finally {
            await server.close();
        }
    } finally {
        releaseLock("fixture-smoke");
    }
}
