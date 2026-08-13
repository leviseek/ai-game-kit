/**
 * 发布结果一致性检测：三重证据判定"产物与源一致"。
 * 证据：
 *  1. 发布信号——插件 onPublishEnd 写的 <objs>/fgui-mcp-probe/publish-signal.json 存在且新鲜
 *  2. 产物新鲜度——assets/ui/<Pkg>/{Pkg}.bin 与 atlas 的 mtime 不早于全部相关源 XML/PNG
 *  3. validate --strict——bun run fgui validate --strict 通过
 * 任一证据缺失 → 判定失败并返回差异明细（spec：不得静默通过）。
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { runFguiCli } from "./fgui-cli";
import { FguiProjectInfo, PROJECT_ROOT } from "./paths";

export interface CheckPublishOptions {
    /** 发布信号文件路径（插件写入） */
    readonly signalPath: string;
    /** 产物目录（assets/ui/<Pkg>） */
    readonly artifactsDir: string;
    /** 源目录（ui/demo/assets/<Pkg>） */
    readonly sourcesDir: string;
}

export interface PublishSignal {
    readonly ok: boolean;
    readonly ts: string;
    readonly packages: string[];
    readonly exportPath: string;
    readonly isSuccess: boolean;
    /** 插件侧记录发布是否重定向到 .objs（未触碰真实产物） */
    readonly redirectToScratch?: boolean;
}

export interface CheckPublishResult {
    readonly ok: boolean;
    readonly evidence: {
        readonly signal: { present: boolean; fresh: boolean; packages: string[]; isSuccess: boolean; ts?: string };
        readonly artifactsFresh: { present: boolean; stale: string[] };
        readonly validate: { passed: boolean; details: string };
    };
    readonly mismatches: string[];
}

/** 解析产物目录（固定 assets/ui，对应发布配置 path=../../assets/ui/{publish_file_name}）。 */
export function resolveArtifactsDir(): string {
    return join(PROJECT_ROOT, "assets", "ui");
}

/** 读取发布信号文件；不存在/解析失败返回 null。 */
export function readSignal(signalPath: string): PublishSignal | null {
    if (!existsSync(signalPath)) return null;
    try {
        return JSON.parse(readFileSync(signalPath, "utf8")) as PublishSignal;
    } catch {
        return null;
    }
}

/** 信号是否新鲜（mtime 距今 < 2 分钟，视为最近一次发布的信号）。 */
function isSignalFresh(signalPath: string, nowMs: number): boolean {
    try {
        const mtime = statSync(signalPath).mtimeMs;
        return nowMs - mtime < 120_000;
    } catch {
        return false;
    }
}

/** 收集源目录最新 mtime（递归扫描 XML/PNG 等源文件）。 */
function latestSourceMtime(sourcesDir: string): number {
    if (!existsSync(sourcesDir)) return 0;
    let latest = 0;
    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (/\.(xml|png|jpg|jpeg|webp|gif|svg|mp3|wav)$/i.test(entry.name)) {
                try {
                    latest = Math.max(latest, statSync(full).mtimeMs);
                } catch {
                    /* 忽略 stat 失败 */
                }
            }
        }
    };
    walk(sourcesDir);
    return latest;
}

/** 收集某包产物文件（*.bin 与 *_atlas*.png）。 */
function listArtifacts(artifactsDir: string, pkg: string): string[] {
    const dir = join(artifactsDir, pkg);
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.(bin|png)$/i.test(entry.name))
        .map((entry) => entry.name);
}

/**
 * 检测单个包的产物与源一致性。
 * 返回 ok=false 时，mismatches 包含每项差异的可读描述。
 */
export function checkPackageArtifacts(artifactsDir: string, sourcesDir: string, pkg: string): { ok: boolean; mismatches: string[] } {
    const mismatches: string[] = [];
    const artifacts = listArtifacts(artifactsDir, pkg);
    if (artifacts.length === 0) {
        mismatches.push(`包 ${pkg} 无发布产物（assets/ui/${pkg}/ 下无 .bin/atlas）`);
        return { ok: false, mismatches };
    }
    const srcLatest = latestSourceMtime(sourcesDir);
    if (srcLatest === 0) {
        mismatches.push(`包 ${pkg} 源目录不存在或为空（${sourcesDir}）`);
        return { ok: false, mismatches };
    }
    for (const name of artifacts) {
        try {
            const mtime = statSync(join(artifactsDir, pkg, name)).mtimeMs;
            if (mtime < srcLatest) {
                mismatches.push(`产物 ${pkg}/${name} 早于源（产物 ${new Date(mtime).toISOString()} < 源最新 ${new Date(srcLatest).toISOString()}）`);
            }
        } catch {
            mismatches.push(`产物 ${pkg}/${name} 无法读取 mtime`);
        }
    }
    return { ok: mismatches.length === 0, mismatches };
}

/**
 * 逐包 validate --strict 聚合：CLI 的 --package 仅接受单包，多包 join 会抛"包不存在"，
 * 故对每个包单独校验并聚合。返回通过与否与失败明细。
 */
export function runValidateAggregated(packages: string[], runCli: (args: string[]) => { exitCode: number; stdout: string; stderr: string }): { passed: boolean; details: string } {
    const failures: string[] = [];
    for (const pkg of packages) {
        const result = runCli(["validate", "--package", pkg, "--strict"]);
        if (result.exitCode !== 0) {
            const detail = (result.stdout.trim() || result.stderr.trim()).split("\n").slice(0, 3).join(" | ");
            failures.push(`${pkg}: ${detail}`);
        }
    }
    return {
        passed: failures.length === 0,
        details: failures.length === 0 ? "全部目标包 validate --strict 通过" : failures.join("\n"),
    };
}

/** 全量检测：信号 + 产物新鲜度 + validate --strict。 */
export function checkPublish(project: FguiProjectInfo, options: { signalPath: string; packages?: string[] }): CheckPublishResult {
    const nowMs = Date.now();
    const signal = readSignal(options.signalPath);
    const signalFresh = isSignalFresh(options.signalPath, nowMs);
    const signalEvidence = {
        present: signal !== null,
        fresh: signalFresh,
        packages: signal ? signal.packages : [],
        isSuccess: signal ? signal.isSuccess : false,
        ts: signal ? signal.ts : undefined,
        redirectToScratch: signal ? signal.redirectToScratch : undefined,
    };

    const artifactsDir = resolveArtifactsDir();
    const sourcesBase = join(project.projectDir, "assets");
    const targetPkgs = options.packages && options.packages.length > 0 ? options.packages : signal && signal.packages.length > 0 ? signal.packages : listArtifactPackages(artifactsDir);

    const artifactsMismatches: string[] = [];
    let artifactsPresent = false;
    for (const pkg of targetPkgs) {
        const result = checkPackageArtifacts(artifactsDir, join(sourcesBase, pkg), pkg);
        if (result.ok) artifactsPresent = true;
        artifactsMismatches.push(...result.mismatches);
    }

    // validate --strict 全量：CLI 的 --package 仅接受单包，逐包校验并聚合退出码（多包 join 会抛"包不存在"）
    const validate = runValidateAggregated(targetPkgs, (args) => runFguiCli(args));
    const validatePassed = validate.passed;
    const validateDetails = validate.details;

    const mismatches: string[] = [];
    if (!signal || !signalFresh || !signal.isSuccess) {
        mismatches.push(signalFresh ? "发布信号缺失或无效：请先在编辑器执行发布（onPublishEnd 应写 publish-signal.json）" : "发布信号过期：请重新在编辑器执行发布后重试");
    }
    if (artifactsMismatches.length > 0) mismatches.push(...artifactsMismatches);
    if (!validatePassed) {
        mismatches.push(`validate --strict 未通过：${validateDetails.split("\n").slice(0, 3).join(" | ")}`);
    }
    // scratch 重定向警示：信号标记发布重定向到 .objs，真实产物未被更新，一致性判定应降级提示
    if (signalEvidence.redirectToScratch === true) {
        mismatches.push("发布信号标记 redirectToScratch=true（发布重定向到 .objs 未触碰真实产物）：若需验证真实产物一致性，请在编辑器真实发布（redirectToScratch:false）后重试");
    }

    return {
        ok: mismatches.length === 0,
        evidence: {
            signal: signalEvidence,
            artifactsFresh: { present: artifactsPresent, stale: artifactsMismatches },
            validate: { passed: validatePassed, details: validateDetails },
        },
        mismatches,
    };
}

/** 列出产物目录下所有包（含 *.bin 的子目录）。 */
function listArtifactPackages(artifactsDir: string): string[] {
    if (!existsSync(artifactsDir)) return [];
    return readdirSync(artifactsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(artifactsDir, entry.name, `${entry.name}.bin`)))
        .map((entry) => entry.name)
        .sort();
}
