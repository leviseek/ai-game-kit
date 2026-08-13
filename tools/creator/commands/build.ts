import { spawn } from "node:child_process";
import { flagBool, flagNumber, flagString, hasHelp, parseArgs } from "../lib/args";
import { findCreatorExe, getProjectRoot } from "../lib/env";
import { acquireLock, releaseLock } from "../lib/lock";
import { closeCreator } from "../lib/proc";
import { sleep, waitForPattern } from "../lib/log";
import { buildParams, resolveSceneUuid } from "../lib/scene";

export const help = "build [--platform web-desktop] [--debug true] [--scene <uuid|路径>...] [--timeout <秒>] —— 构建（自动先关闭实例）";

const SUCCESS = /build Task \([^)]+\) Finished/;

export async function run(argv: readonly string[]): Promise<number> {
    const parsed = parseArgs(argv);
    if (hasHelp(parsed)) {
        console.log(help);
        return 0;
    }

    if (!acquireLock("build")) {
        console.error("[ccc:build] 已有构建在运行（锁被占用），请等待完成");
        return 1;
    }

    try {
        const platform = flagString(parsed, "platform", "web-desktop") ?? "web-desktop";
        const debug = flagBool(parsed, "debug", true);
        const timeoutMs = flagNumber(parsed, "timeout", 240) * 1000;

        const sceneArgs = parsed.flags.get("scene");
        const scenes =
            sceneArgs === true || sceneArgs === undefined
                ? []
                : sceneArgs
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean);
        const sceneUuids = scenes.map((scene) => resolveSceneUuid(scene));

        console.log("[ccc:build] 关闭已有 Creator 实例（构建需独占）...");
        closeCreator();
        await sleep(5000);

        const exe = findCreatorExe();
        const params = buildParams(platform, debug, sceneUuids);
        const args = ["--nologin", "--project", getProjectRoot(), "--build", params];
        console.log(`[ccc:build] 启动构建: ${exe} ${args.join(" ")}`);

        let output = "";
        const child = spawn(exe, args, { stdio: ["ignore", "pipe", "pipe"] });
        child.stdout.on("data", (chunk) => {
            output += chunk.toString();
        });
        child.stderr.on("data", (chunk) => {
            output += chunk.toString();
        });

        const t0 = Date.now();
        const finished = await waitForPattern(() => output, SUCCESS, timeoutMs, 2000);
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

        const warnings = output.split("\n").filter((line) => line.includes("deoptimised"));
        const failed = !finished && output.includes("Failed to build");

        if (finished && !failed) {
            console.log(`[ccc:build] 构建成功（${elapsed}s）: ${platform}`);
            if (warnings.length > 0) {
                console.warn(`[ccc:build] 警告 ${warnings.length} 条（BABEL deoptimise，非失败）`);
            }
            return 0;
        }

        console.error(`[ccc:build] 构建失败（${elapsed}s）`);
        const tail = output.split("\n").slice(-30).join("\n");
        console.error("=== 构建日志尾部 ===\n" + tail);
        child.kill();
        return 1;
    } finally {
        releaseLock("build");
    }
}
