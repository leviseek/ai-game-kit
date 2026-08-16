import { parseArgs } from "../lib/args";
import { expandAssets, hasStructuralErrors, loadManifest, validateManifest } from "../lib/manifest";
import { aiSyncRoot, repoRoot } from "../lib/project";
import { checkExpected, expectedFiles, scanManagedRoots, writeExpected, type SyncIssue } from "../lib/sync";

export const help = "sync —— 将 registry 同步到各工具目录（默认 dry-run 输出差异清单，--apply 才落盘）";

export function run(argv: readonly string[]): number {
    const parsed = parseArgs(argv);
    if (parsed.flags.has("help")) {
        console.log(help);
        return 0;
    }
    const apply = parsed.flags.get("apply") === true;
    const project = repoRoot();
    const sync = aiSyncRoot();
    const manifest = loadManifest(sync);
    const assets = expandAssets(manifest);
    const issues: SyncIssue[] = validateManifest(sync, manifest);

    if (hasStructuralErrors(issues)) {
        // manifest 结构问题会污染结论，拒绝同步
        for (const issue of issues) console.error(`[error] ${issue.message}`);
        console.error(`[ai-sync:sync] manifest 结构错误，拒绝同步`);
        return 1;
    }

    const expected = expectedFiles(sync, assets);

    // dry-run：列出差异（缺失/过期）与受管根扫描结果
    const diffIssues = [...checkExpected(project, expected), ...scanManagedRoots(project, assets, expected)];
    const diffFiles = diffIssues.filter((i) => i.code === "missing" || i.code === "stale").map((i) => i.path ?? "");
    for (const issue of diffIssues) {
        const tag = issue.severity === "error" ? "error" : "warning";
        console.error(`[${tag}] ${issue.message}`);
    }

    if (!apply) {
        if (diffFiles.length === 0) {
            console.log(`[ai-sync:sync] 无差异，全部 ${expected.length} 个受管文件已是最新`);
        } else {
            console.log(`[ai-sync:sync] dry-run：${diffFiles.length} 个文件待写入（使用 --apply 落盘）`);
        }
        return diffFiles.length === 0 ? 0 : 1;
    }

    const { written, unchanged } = writeExpected(project, expected);
    for (const path of written) console.log(`[ai-sync:sync] 写入 ${path}`);
    console.log(`[ai-sync:sync] 完成：写入 ${written.length} 个，未变化 ${unchanged.length} 个`);
    return 0;
}
