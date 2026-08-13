import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { hasHelp, parseArgs } from "../lib/args";
import { findCreatorHome, getCreatorTempDir, getProjectRoot } from "../lib/env";

export const help = "typecheck —— strict 类型检查（framework + fairygui 接入验证）";

/**
 * 复用 check-foundation-contracts.ts 的 tsc 探测链：
 * COCOS_TSC → COCOS_CREATOR_HOME → 硬编码默认路径。
 */
function findTsc(): string {
    const candidates = [
        process.env.COCOS_TSC,
        process.env.COCOS_CREATOR_HOME === undefined ? undefined : resolve(process.env.COCOS_CREATOR_HOME, "resources/app.asar.unpacked/node_modules/typescript/lib/tsc.js"),
        resolve(findCreatorHome(), "resources/app.asar.unpacked/node_modules/typescript/lib/tsc.js"),
    ];
    const hit = candidates.find((candidate) => candidate !== undefined && existsSync(candidate));
    if (hit === undefined) {
        throw new Error("无法定位 Creator 内置 tsc，请设置 COCOS_TSC");
    }
    return hit;
}

/** 递归收集 .ts 文件，排除 adapters/cocos（与既有脚本一致：cc 运行时类型不在静态检查范围）。 */
function collectTypeScriptFiles(directory: string): string[] {
    if (!existsSync(directory)) {
        return [];
    }
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) {
            if (path.replaceAll("\\", "/").includes("/adapters/cocos")) {
                return [];
            }
            return collectTypeScriptFiles(path);
        }
        return entry.isFile() && path.endsWith(".ts") ? [path] : [];
    });
}

export async function run(argv: readonly string[]): Promise<number> {
    const parsed = parseArgs(argv);
    if (hasHelp(parsed)) {
        console.log(help);
        return 0;
    }

    const projectRoot = getProjectRoot();
    const tsc = findTsc();
    const frameworkRoot = join(projectRoot, "assets", "framework");
    const declarations = join(projectRoot, "temp", "declarations");

    if (!existsSync(declarations)) {
        console.error("[ccc:typecheck] 缺少 temp/declarations，请先打开一次 Creator 生成");
        return 1;
    }

    // fairygui 接入探针：验证 import-map 裸包名在 strict 下可解析
    const probeDir = join(getCreatorTempDir(), "typecheck");
    mkdirSync(probeDir, { recursive: true });
    const probeFile = join(probeDir, "fairygui-probe.ts");
    writeFileSync(
        probeFile,
        [
            'import { GRoot, UIPackage, GComponent, GObject } from "fairygui-cc";',
            "export const rootRef: typeof GRoot = GRoot;",
            "export const createFn = UIPackage.createObject;",
            "export type AnyObj = GObject;",
            "export type AnyComp = GComponent;",
            "",
        ].join("\n"),
        "utf8",
    );

    const fairyguiDts = join(projectRoot, "assets", "third-party", "fairygui", "fairygui.d.ts");
    const files = [...collectTypeScriptFiles(frameworkRoot), probeFile, ...(existsSync(fairyguiDts) ? [fairyguiDts] : [])];

    try {
        const result = execFileSync(
            "node",
            [tsc, "--noEmit", "--strict", "--target", "ES2015", "--module", "ES2015", "--moduleResolution", "node", "--skipLibCheck", "--typeRoots", declarations, ...files],
            { cwd: projectRoot, encoding: "utf8" },
        );
        console.log("[ccc:typecheck] 类型检查通过（0 diagnostics）");
        console.log(result);
        return 0;
    } catch (error) {
        const stderr = error instanceof Error ? error.message : String(error);
        console.error("[ccc:typecheck] 类型检查失败");
        console.error(stderr);
        return 1;
    } finally {
        rmSync(probeFile, { force: true });
    }
}
