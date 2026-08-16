import { parseArgs } from "../lib/args";
import { expandAssets, hasStructuralErrors, loadManifest, validateManifest } from "../lib/manifest";
import { aiSyncRoot, repoRoot } from "../lib/project";
import { checkExpected, expectedFiles, scanManagedRoots, type SyncIssue } from "../lib/sync";

export const help = "doctor —— 漂移全量诊断：缺失/过期/多余/空目录/manifest 结构问题，带严重度与修复建议";

export function run(argv: readonly string[]): number {
    const parsed = parseArgs(argv);
    if (parsed.flags.has("help")) {
        console.log(help);
        return 0;
    }
    const project = repoRoot();
    const sync = aiSyncRoot();
    const manifest = loadManifest(sync);
    const assets = expandAssets(manifest);
    const structural = validateManifest(sync, manifest);

    if (hasStructuralErrors(structural)) {
        // 结构错误会使漂移诊断不可信（源缺失时 expectedFiles 无法展开），只报结构问题
        for (const issue of structural) {
            console.error(`[error] ${issue.message}`);
        }
        console.error(`[ai-sync:doctor] manifest 结构错误，无法诊断漂移；先修复 registry/manifest`);
        return 1;
    }

    const expected = expectedFiles(sync, assets);
    const issues: SyncIssue[] = [...structural, ...checkExpected(project, expected), ...scanManagedRoots(project, assets, expected)];

    const bySeverity = (sev: SyncIssue["severity"]) => issues.filter((i) => i.severity === sev);
    const errors = bySeverity("error");
    const warnings = bySeverity("warning");

    for (const issue of issues) {
        const tag = issue.severity === "error" ? "error" : "warning";
        console.error(`[${tag}] ${issue.message}`);
    }
    console.log(`[ai-sync:doctor] 汇总：${errors.length} error / ${warnings.length} warning`);
    if (errors.length > 0) {
        console.error(`[ai-sync:doctor] 修复建议：registry/manifest 结构问题先修 registry；受管文件漂移运行 bun run ai-sync sync --apply`);
    }
    return errors.length === 0 ? 0 : 1;
}
