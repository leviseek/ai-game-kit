/**
 * verify:ui-loop —— FGUI「源 XML → 真实发布 → 三重证据检测 → 运行时冒烟」验证闭环。
 *
 * 四阶段：
 *   1. `fgui validate --strict`（源 XML 引用完整性 + 语义，纯 CLI 无环境依赖）
 *   2. 经 fgui-mcp 文件邮箱真实发布（`redirectToScratch:false` 写入 assets/ui）
 *   3. `checkPublish` 三重证据（编辑器发布信号 + 产物 mtime 新鲜度 + validate --strict）
 *   4. `ccc ui-smoke`（headless Chrome 运行时验证 FGUI UI 根/页面/遮罩/资源释放）
 *
 * 退出码：0 全通过；1 任一阶段失败；2 环境缺失（FGUI 编辑器/探针不可达，或 Creator 不可定位）。
 * 环境缺失时输出恢复指引，绝不假装成功。
 * 用法：bun run verify:ui-loop --package <包名>
 *
 * 核心编排 `verifyUiLoop` 依赖可注入（runBun/locateProject/bridge/checkPublish/findCreatorHome），
 * 便于单测覆盖环境缺失与各阶段失败路径；入口用真实依赖。
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { MailboxBridge, isBridgeReachable, type BridgeCallResult } from "../tools/fgui-mcp/lib/bridge";
import { locateProject, type FguiProjectInfo } from "../tools/fgui-mcp/lib/paths";
import { checkPublish, type CheckPublishResult } from "../tools/fgui-mcp/lib/check-publish";
import { findCreatorHome } from "../tools/creator/lib/env";

const PROJECT_ROOT = resolve(import.meta.dir, "..");
/** 发布为异步长操作（编辑器帧循环驱动），放宽到 180s（与 fgui-mcp deferred 工具同限）。 */
const PUBLISH_TIMEOUT_MS = 180_000;

export interface RunResult {
    readonly code: number;
    readonly output: string;
}

/** 可注入依赖：子进程执行、工程定位、桥可达性、桥调用、三重证据、Creator 定位。 */
export interface VerifyLoopDeps {
    readonly runBun: (script: string, args: readonly string[]) => RunResult;
    readonly locateProject: () => FguiProjectInfo;
    readonly isBridgeReachable: (mailboxDir: string) => boolean;
    readonly createBridge: (mailboxDir: string) => { call: (method: string, params: Record<string, unknown>) => Promise<BridgeCallResult> };
    readonly checkPublish: (project: FguiProjectInfo, options: { signalPath: string; packages: string[] }) => CheckPublishResult;
    readonly findCreatorHome: () => string;
}

export const realDeps: VerifyLoopDeps = {
    runBun: (script, args) => {
        const result = spawnSync("bun", ["run", script, ...args], { cwd: PROJECT_ROOT, encoding: "utf8" });
        return { code: result.status ?? 1, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
    },
    locateProject: () => locateProject(),
    isBridgeReachable: (dir) => isBridgeReachable(dir),
    createBridge: (mailboxDir) => new MailboxBridge(mailboxDir, { timeoutMs: PUBLISH_TIMEOUT_MS, pollMs: 200 }),
    checkPublish: (project, options) => checkPublish(project, options),
    findCreatorHome: () => findCreatorHome(),
};

export async function verifyUiLoop(pkg: string, deps: VerifyLoopDeps): Promise<number> {
    // 阶段 0：工程定位 + 编辑器探针可达性（环境检测）
    let project: FguiProjectInfo;
    try {
        project = deps.locateProject();
    } catch (error) {
        console.error(`[verify:ui-loop] FGUI 工程不可定位（退出码 2）: ${error instanceof Error ? error.message : String(error)}`);
        return 2;
    }
    if (!deps.isBridgeReachable(project.mailboxDir)) {
        console.error("[verify:ui-loop] FGUI 编辑器探针不可达（退出码 2）：请打开 FGUI 编辑器并加载 fgui-mcp-probe 插件（控制台出现「邮箱服务器启动」），保持编辑器窗口前台");
        return 2;
    }

    // 阶段 1：源 XML 校验（阻断式）
    console.log(`[verify:ui-loop] 阶段 1/4 fgui validate --strict --package ${pkg}`);
    const validate = deps.runBun("fgui", ["validate", "--package", pkg, "--strict"]);
    if (validate.code !== 0) {
        console.error(`[verify:ui-loop] validate 失败（阶段 1 阻断，退出码 1）:\n${validate.output}`);
        return 1;
    }

    // 阶段 2：真实发布（redirectToScratch:false 写 assets/ui）
    console.log(`[verify:ui-loop] 阶段 2/4 真实发布 ${pkg}（redirectToScratch=false）`);
    const bridge = deps.createBridge(project.mailboxDir);
    const publish = await bridge.call("trigger_publish", { package: pkg, redirectToScratch: false });
    if (!publish.reached) {
        console.error(`[verify:ui-loop] 编辑器桥接不可达（环境缺失，退出码 2）:\n${publish.error}`);
        return 2;
    }
    if (!publish.ok) {
        console.error(`[verify:ui-loop] 发布失败（阶段 2 阻断，退出码 1）:\n${publish.error}`);
        return 1;
    }
    const publishResult = publish.result as { isSuccess?: boolean; exportPath?: string } | undefined;
    console.log(`[verify:ui-loop] 发布返回 isSuccess=${publishResult?.isSuccess} exportPath=${publishResult?.exportPath}`);
    if (publishResult?.isSuccess === false) {
        console.error("[verify:ui-loop] 编辑器报告发布未成功（阶段 2 阻断，退出码 1）");
        return 1;
    }

    // 阶段 3：三重证据检测
    console.log("[verify:ui-loop] 阶段 3/4 check-publish 三重证据（信号 + 产物 mtime + validate）");
    const signalPath = resolve(project.probeDir, "publish-signal.json");
    const check = deps.checkPublish(project, { signalPath, packages: [pkg] });
    for (const mismatch of check.mismatches) {
        console.error(`[verify:ui-loop] 证据不一致: ${mismatch}`);
    }
    if (!check.ok) {
        console.error("[verify:ui-loop] 发布产物检测失败（阶段 3 阻断，退出码 1）");
        return 1;
    }

    // 阶段 4：运行时冒烟（先预检 Creator 定位，缺失按环境缺失处理）
    console.log("[verify:ui-loop] 阶段 4/4 ccc ui-smoke（运行时验证）");
    try {
        deps.findCreatorHome();
    } catch (error) {
        console.error(`[verify:ui-loop] Creator 不可定位（环境缺失，退出码 2）: ${error instanceof Error ? error.message : String(error)}`);
        console.error("[verify:ui-loop] 恢复指引：设置 COCOS_CREATOR_HOME 指向 Creator 安装目录，或先运行 bun run ccc open 确认可用");
        return 2;
    }
    const smoke = deps.runBun("ccc", ["ui-smoke"]);
    if (smoke.code !== 0) {
        console.error(`[verify:ui-loop] ui-smoke 失败（阶段 4 阻断，退出码 1）:\n${smoke.output}`);
        return 1;
    }

    console.log(`[verify:ui-loop] 通过：${pkg} 校验 → 发布 → 三重证据 → 运行时冒烟全部完成`);
    return 0;
}

interface Options {
    readonly package: string;
}

function parseArgs(argv: readonly string[]): Options | { readonly error: string } {
    const args = [...argv];
    const pkgIndex = args.indexOf("--package");
    if (pkgIndex < 0) return { error: "缺少必填参数 --package <包名>" };
    const pkg = args[pkgIndex + 1];
    if (pkg === undefined || pkg.startsWith("-")) return { error: "--package 需要包名" };
    return { package: pkg };
}

async function main(): Promise<number> {
    const parsed = parseArgs(process.argv.slice(2));
    if ("error" in parsed) {
        console.error(`[verify:ui-loop] ${parsed.error}`);
        console.error("用法: bun run verify:ui-loop --package <包名>");
        return 2;
    }
    return verifyUiLoop(parsed.package, realDeps);
}

// 仅直接运行脚本时执行入口（import.meta.main 守卫），测试 import verifyUiLoop 不触发副作用
if (import.meta.main) {
    process.exit(await main());
}
