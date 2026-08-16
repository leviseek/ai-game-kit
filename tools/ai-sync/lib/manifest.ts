import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

/** 资产类别：skill 为目录资产，agent/command 为单文件资产。 */
export type AssetKind = "skill" | "agent" | "command";

export interface ManifestEntry {
    readonly targets: readonly string[];
}

export interface Manifest {
    readonly version: 1;
    readonly skills: Readonly<Record<string, ManifestEntry>>;
    readonly agents: Readonly<Record<string, ManifestEntry>>;
    readonly commands: Readonly<Record<string, ManifestEntry>>;
}

/** 展开后的资产：id + 类别 + registry 内源路径 + 目标路径列表。 */
export interface ManifestAsset {
    readonly id: string;
    readonly kind: AssetKind;
    /** 相对 ai-sync 根（registry/ 之下）；skill 为目录，agent/command 为 .md 文件 */
    readonly source: string;
    /** 相对仓库根的目标路径，形态与 source 一致（目录/文件） */
    readonly targets: readonly string[];
}

export interface ManifestIssue {
    readonly severity: "error" | "warning";
    readonly code: string;
    readonly message: string;
}

export const MANIFEST_FILE = "manifest.json";
export const REGISTRY_DIR = "registry";

/** 结构错误问题码：这类错误会使 expectedFiles/check 结论不可信，需先修复 registry/manifest。 */
export const STRUCTURAL_ERROR_CODES = new Set(["invalid-id", "empty-targets", "invalid-target", "duplicate-target", "missing-source"]);

/** 是否存在结构错误（error 级且属于结构问题码）。 */
export function hasStructuralErrors(issues: readonly ManifestIssue[]): boolean {
    return issues.some((i) => i.severity === "error" && STRUCTURAL_ERROR_CODES.has(i.code));
}

/** 读取并解析 manifest.json（JSON 结构错误直接抛出）。 */
export function loadManifest(aiSyncRoot: string): Manifest {
    const file = join(aiSyncRoot, MANIFEST_FILE);
    return JSON.parse(readFileSync(file, "utf8")) as Manifest;
}

/**
 * 结构校验：id 格式、target 合法性（相对路径、不越界）、跨资产 target 查重、registry 源存在性。
 * 返回全部问题；error 级问题会阻断 sync/check 的可信结论。
 */
export function validateManifest(aiSyncRoot: string, manifest: Manifest): ManifestIssue[] {
    const issues: ManifestIssue[] = [];
    const seenTargets = new Map<string, string>();

    const checkGroup = (kind: AssetKind, group: Readonly<Record<string, ManifestEntry>>): void => {
        for (const [id, entry] of Object.entries(group)) {
            if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
                issues.push({ severity: "error", code: "invalid-id", message: `资产 id 非法: "${id}"（应为小写 kebab-case）` });
            }
            if (!Array.isArray(entry.targets) || entry.targets.length === 0) {
                issues.push({ severity: "error", code: "empty-targets", message: `${kind}/${id} 未声明 targets` });
                continue;
            }
            for (const target of entry.targets) {
                if (typeof target !== "string" || target.length === 0 || target.startsWith("/") || target.split(/[\\/]/).includes("..")) {
                    issues.push({ severity: "error", code: "invalid-target", message: `${kind}/${id} target 非法: "${target}"（必须为仓库内相对路径）` });
                    continue;
                }
                const normalized = target.split("/").join(sep);
                const prior = seenTargets.get(normalized);
                if (prior !== undefined) {
                    issues.push({ severity: "error", code: "duplicate-target", message: `target "${target}" 被 "${prior}" 与 "${id}" 重复声明` });
                } else {
                    seenTargets.set(normalized, id);
                }
            }
        }
    };

    checkGroup("skill", manifest.skills);
    checkGroup("agent", manifest.agents);
    checkGroup("command", manifest.commands);

    // registry 源存在性：目录资产须为目录，文件资产须为文件
    for (const asset of expandAssets(manifest)) {
        const sourcePath = join(aiSyncRoot, REGISTRY_DIR, asset.source);
        if (!existsSync(sourcePath)) {
            issues.push({ severity: "error", code: "missing-source", message: `registry 源缺失: ${REGISTRY_DIR}/${asset.source}` });
        }
    }
    return issues;
}

/** 按类别约定推导每个资产的 registry 源路径。 */
export function expandAssets(manifest: Manifest): ManifestAsset[] {
    const assets: ManifestAsset[] = [];
    for (const [id, entry] of Object.entries(manifest.skills)) {
        assets.push({ id, kind: "skill", source: `skills/${id}`, targets: entry.targets });
    }
    for (const [id, entry] of Object.entries(manifest.agents)) {
        assets.push({ id, kind: "agent", source: `agents/${id}.md`, targets: entry.targets });
    }
    for (const [id, entry] of Object.entries(manifest.commands)) {
        assets.push({ id, kind: "command", source: `commands/${id}.md`, targets: entry.targets });
    }
    return assets;
}

/** 受管根：全部 target 的父目录（去重、排序），用于多余文件/空目录扫描。 */
export function managedRoots(assets: readonly ManifestAsset[]): string[] {
    const roots = new Set<string>();
    for (const asset of assets) {
        for (const target of asset.targets) {
            const idx = target.lastIndexOf("/");
            roots.add(idx > 0 ? target.slice(0, idx) : ".");
        }
    }
    return [...roots].sort();
}

/** 读取 registry 目录下全部文件（相对目录的 POSIX 路径）。 */
export function collectFiles(dir: string, base: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...collectFiles(full, base));
        } else if (entry.isFile()) {
            out.push(relativePath(full, base));
        }
    }
    return out.sort();
}

function relativePath(full: string, base: string): string {
    return full.slice(base.length).replace(/^[\\/]/, "").split(sep).join("/");
}
