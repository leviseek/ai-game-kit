import { parseArgs } from "../lib/args";
import { expandAssets, hasStructuralErrors, loadManifest } from "../lib/manifest";
import { loadModels } from "../lib/models";
import { aiSyncRoot, repoRoot } from "../lib/project";
import { checkExpected, expectedFiles, scanManagedRoots, type SyncIssue } from "../lib/sync";
import { validateAll } from "../lib/validate";

export const help = "check —— 校验受管文件与 registry 逐字一致（缺失/过期/多余均 error，非零退出）";

export function run(argv: readonly string[]): number {
    const parsed = parseArgs(argv);
    if (parsed.flags.has("help")) {
        console.log(help);
        return 0;
    }
    const project = repoRoot();
    const sync = aiSyncRoot();
    const manifest = loadManifest(sync);
    const models = loadModels(sync);
    const issues: SyncIssue[] = validateAll(sync, manifest);

    if (hasStructuralErrors(issues)) {
        // manifest/模型/模板结构问题会污染结论，先报结构错误并拒绝给出 check 结果
        printIssues(issues);
        console.error(`[ai-sync:check] 结构错误，check 结论不可信，先修复 registry/manifest/models.json`);
        return 1;
    }

    const expected = expectedFiles(sync, expandAssets(manifest), models);
    issues.push(...checkExpected(project, expected), ...scanManagedRoots(project, expandAssets(manifest), expected));
    printIssues(issues);

    const errorCount = issues.filter((i) => i.severity === "error").length;
    if (errorCount === 0) {
        console.log(`[ai-sync:check] 通过：${expected.length} 个受管文件与 registry 一致`);
    } else {
        console.error(`[ai-sync:check] 失败：${errorCount} 个 error（运行 bun run ai-sync sync --apply 修复）`);
    }
    return errorCount === 0 ? 0 : 1;
}

function printIssues(issues: readonly SyncIssue[]): void {
    for (const issue of issues) {
        const tag = issue.severity === "error" ? "error" : "warning";
        console.error(`[${tag}] ${issue.message}`);
    }
}
