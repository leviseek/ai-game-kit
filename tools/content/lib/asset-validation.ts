/**
 * 资产帧文件存在性校验：配置条目声明的动画帧（assets/<bundleDir>/<dir>/<prefix>_<NN>.<ext>）
 * 必须真实存在；缺失帧报 error。数据源：unit-animations 表（schema.assets 声明）。
 * 另含 skill-effects kind=explosion 的爆炸帧专项（对应 animUrls 的 EXPLOSION_FRAME_URLS 12 帧约定）。
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AssetSpec, ContentIssue, TableSchema } from "./schemas";

export interface AssetDeps {
    readonly exists: (file: string) => boolean;
}

export const realAssetDeps: AssetDeps = { exists: (file) => existsSync(file) };

function pad2(value: number): string {
    return value < 10 ? `0${value}` : String(value);
}

/** 爆炸序列帧数（与 view/animUrls.ts 的 EXPLOSION_FRAME_URLS 一致）。 */
const EXPLOSION_FRAME_COUNT = 12;

/** 按条目声明的 prefix/count 展开期望帧文件相对路径（资产目录内）。 */
function expectedFrameFiles(spec: AssetSpec, row: Record<string, unknown>): { readonly anim: string; readonly prefix: string; readonly frame: string }[] {
    const count = row[spec.countField];
    const prefixValue = row[spec.prefixField];
    if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) return [];
    const exts = spec.imageExts ?? ["png"];
    const ext = exts[0] ?? "png";
    const prefixes: { readonly anim: string; readonly prefix: string }[] =
        typeof prefixValue === "string"
            ? [{ anim: "", prefix: prefixValue }]
            : prefixValue !== null && typeof prefixValue === "object"
              ? Object.entries(prefixValue as Record<string, unknown>).map(([anim, prefix]) => ({ anim, prefix: String(prefix) }))
              : [];
    const files: { anim: string; prefix: string; frame: string }[] = [];
    for (const { anim, prefix } of prefixes) {
        for (let index = 0; index < count; index++) {
            files.push({ anim, prefix, frame: `${prefix}_${pad2(index)}.${ext}` });
        }
    }
    return files;
}

/** 校验声明了 assets 的表：bundle 目录、dir 子目录与全部帧文件存在性。 */
export function validateAssetFiles(projectRoot: string, schema: TableSchema, rows: readonly unknown[], deps: AssetDeps = realAssetDeps): ContentIssue[] {
    const spec = schema.assets;
    if (spec === undefined) return [];
    const issues: ContentIssue[] = [];

    const bundleRoot = join(projectRoot, "assets", spec.bundleDir);
    if (!deps.exists(bundleRoot)) {
        issues.push({ severity: "error", code: "asset-bundle-missing", message: `资产 bundle 目录缺失: assets/${spec.bundleDir}` });
        return issues;
    }

    rows.forEach((row, index) => {
        if (row === null || typeof row !== "object" || Array.isArray(row)) return;
        const record = row as Record<string, unknown>;
        const rowPath = `${schema.file}[${index}]`;
        const dir = record[spec.dirField];
        if (typeof dir !== "string" || dir.length === 0) return; // 字段类型由 fields 校验
        const dirFull = join(bundleRoot, dir);
        if (!deps.exists(dirFull)) {
            issues.push({ severity: "error", code: "asset-dir-missing", message: `${rowPath} 资产子目录缺失: ${spec.bundleDir}/${dir}` });
            return;
        }
        for (const file of expectedFrameFiles(spec, record)) {
            if (!deps.exists(join(dirFull, file.frame))) {
                const animLabel = file.anim === "" ? "" : `${file.anim} `;
                issues.push({
                    severity: "error",
                    code: "asset-frame-missing",
                    message: `${rowPath} 动画帧缺失: ${animLabel}${file.frame}（期望 ${spec.bundleDir}/${dir}/${file.frame}）`,
                });
            }
        }
    });
    return issues;
}

/** skill-effects kind=explosion → 爆炸序列帧存在性（代码约定 EXPLOSION_FRAME_URLS 12 帧）。 */
export function validateExplosionFrames(projectRoot: string, rows: readonly unknown[], deps: AssetDeps = realAssetDeps): ContentIssue[] {
    const issues: ContentIssue[] = [];
    const dir = join(projectRoot, "assets", "animations", "auto-battle");
    let checked = false;
    for (const row of rows) {
        if (row === null || typeof row !== "object" || Array.isArray(row)) continue;
        if ((row as Record<string, unknown>).kind !== "explosion") continue;
        for (let index = 0; index < EXPLOSION_FRAME_COUNT; index++) {
            const frame = `fx_explosion_${pad2(index)}.png`;
            if (!deps.exists(join(dir, frame))) {
                issues.push({ severity: "error", code: "asset-frame-missing", message: `爆炸序列帧缺失: animations/auto-battle/${frame}` });
            }
        }
        checked = true;
        break;
    }
    if (!checked) {
        issues.push({ severity: "warning", code: "asset-kind-unused", message: "skill-effects 无 kind=explosion 条目（爆炸帧校验跳过）" });
    }
    return issues;
}
