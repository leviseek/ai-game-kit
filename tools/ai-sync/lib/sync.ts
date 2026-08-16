import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { collectFiles, managedRoots, REGISTRY_DIR, type ManifestAsset } from "./manifest";
import { renderTemplate, type Models } from "./models";

/** 期望文件：目标路径（相对仓库根，POSIX）+ 期望内容（registry 原文；agent 为模板渲染后）。 */
export interface ExpectedFile {
    readonly path: string;
    readonly content: string;
}

export interface SyncIssue {
    readonly severity: "error" | "warning";
    readonly code: string;
    readonly message: string;
    readonly path?: string;
}

export interface WriteResult {
    readonly written: readonly string[];
    readonly unchanged: readonly string[];
}

/**
 * 由资产推导全部期望文件：目录资产（skill）展开为目录树，文件资产（agent/command）单文件；
 * 每个 registry 文件映射到该资产的全部 target。agent 资产为模板（frontmatter 含
 * `{{model:<role>}}` 占位符），经 models.json 渲染出 primary 模型；其余资产逐字复制。
 * 调用前须先经 validateAll 保证模板可渲染（未知角色/语法错误已短路）。
 */
export function expectedFiles(aiSyncRoot: string, assets: readonly ManifestAsset[], models: Models): ExpectedFile[] {
    const out: ExpectedFile[] = [];
    for (const asset of assets) {
        const source = join(aiSyncRoot, REGISTRY_DIR, asset.source);
        const isDir = statSync(source).isDirectory();
        const relFiles = isDir ? collectFiles(source, source) : [""];
        for (const rel of relFiles) {
            const srcFile = isDir ? join(source, rel) : source;
            const raw = readFileSync(srcFile, "utf8");
            const content = asset.kind === "agent" ? (renderTemplate(raw, models).content ?? raw) : raw;
            for (const target of asset.targets) {
                const targetPath = isDir ? join(target, rel) : target;
                out.push({ path: targetPath.split("\\").join("/"), content });
            }
        }
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** 缺失 / 过期（逐字对比，尾换行容错，语义对齐 checkTypeFreshness）。 */
export function checkExpected(repoRoot: string, expected: readonly ExpectedFile[]): SyncIssue[] {
    const issues: SyncIssue[] = [];
    for (const file of expected) {
        const full = join(repoRoot, file.path);
        if (!existsSync(full)) {
            issues.push({
                severity: "error",
                code: "missing",
                message: `受管文件缺失: ${file.path}（先运行 bun run ai-sync sync --apply）`,
                path: file.path,
            });
            continue;
        }
        if (!statSync(full).isFile()) {
            issues.push({
                severity: "error",
                code: "not-file",
                message: `受管路径不是文件: ${file.path}`,
                path: file.path,
            });
            continue;
        }
        const actual = readFileSync(full, "utf8").replace(/\n$/, "");
        const want = file.content.replace(/\n$/, "");
        if (actual !== want) {
            issues.push({
                severity: "error",
                code: "stale",
                message: `受管文件过期: ${file.path} 与 registry 不一致（先运行 bun run ai-sync sync --apply）`,
                path: file.path,
            });
        }
    }
    return issues;
}

/**
 * 受管根下的多余文件（不在期望清单）与空目录（warning 级）。
 * 受管根由 manifest target 的父目录推导；缺失的受管根由 checkExpected 覆盖，此处跳过。
 */
export function scanManagedRoots(repoRoot: string, assets: readonly ManifestAsset[], expected: readonly ExpectedFile[]): SyncIssue[] {
    const issues: SyncIssue[] = [];
    const expectedSet = new Set(expected.map((f) => f.path));
    for (const root of managedRoots(assets)) {
        const rootFull = join(repoRoot, root);
        if (!existsSync(rootFull) || !statSync(rootFull).isDirectory()) continue;
        walk(rootFull, "", (rel, isDir, full) => {
            const posix = (root === "." ? rel : `${root}/${rel}`).split("\\").join("/");
            if (isDir) {
                if (readdirSync(full).length === 0) {
                    issues.push({
                        severity: "warning",
                        code: "empty-dir",
                        message: `未受管空目录: ${posix}/（registry 未声明，若无需保留请删除）`,
                        path: posix,
                    });
                }
                return;
            }
            if (!expectedSet.has(posix)) {
                issues.push({
                    severity: "warning",
                    code: "extra",
                    message: `未受管文件: ${posix}（不在 registry 期望清单内）`,
                    path: posix,
                });
            }
        });
    }
    return issues;
}

function walk(dir: string, relBase: string, visit: (rel: string, isDir: boolean, full: string) => void): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const rel = relBase === "" ? entry.name : `${relBase}/${entry.name}`;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            visit(rel, true, full);
            walk(full, rel, visit);
        } else if (entry.isFile()) {
            visit(rel, false, full);
        }
    }
}

/** 将期望文件写入磁盘（目标内容与期望一致则跳过），返回写入/未变化清单。 */
export function writeExpected(repoRoot: string, expected: readonly ExpectedFile[]): WriteResult {
    const written: string[] = [];
    const unchanged: string[] = [];
    for (const file of expected) {
        const full = join(repoRoot, file.path);
        if (existsSync(full) && readFileSync(full, "utf8") === file.content) {
            unchanged.push(file.path);
            continue;
        }
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, file.content, "utf8");
        written.push(file.path);
    }
    return { written, unchanged };
}
