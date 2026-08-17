/**
 * 资产帧文件存在性校验：配置条目声明的动画帧（assets/<bundleDir>/<dir>/<prefix>_<NN>.<ext>）
 * 必须真实存在；缺失帧报 error。数据源：unit-animations 表（schema.assets 声明）。
 * 另含 skill-effects 各视觉类型的序列帧专项（与 view/animUrls.ts 的帧数约定一致）。
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
    const defaultCount = row[spec.countField];
    const countByAnimValue = spec.countByAnimField === undefined ? undefined : row[spec.countByAnimField];
    const countByAnim = countByAnimValue !== null && typeof countByAnimValue === "object" ? (countByAnimValue as Record<string, unknown>) : undefined;
    const prefixValue = row[spec.prefixField];
    if (typeof defaultCount !== "number" || !Number.isFinite(defaultCount) || defaultCount <= 0) return [];
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
        const override = anim === "" ? undefined : countByAnim?.[anim];
        const count = typeof override === "number" && Number.isFinite(override) && override > 0 ? override : defaultCount;
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

/** skill-effects 视觉类型 → 运行时约定的透明序列帧存在性。 */
export function validateExplosionFrames(projectRoot: string, rows: readonly unknown[], deps: AssetDeps = realAssetDeps): ContentIssue[] {
    const issues: ContentIssue[] = [];
    const dir = join(projectRoot, "assets", "animations", "auto-battle");
    const usedKinds = new Set(rows.filter((row): row is Record<string, unknown> => row !== null && typeof row === "object" && !Array.isArray(row)).map((row) => String(row.kind)));
    const specs: readonly { readonly kind: string; readonly sequences: readonly { readonly prefix: string; readonly count: number; readonly label: string }[] }[] = [
        { kind: "explosion", sequences: [{ prefix: "fx_explosion", count: EXPLOSION_FRAME_COUNT, label: "爆炸" }] },
        {
            kind: "physical-impact",
            sequences: [
                { prefix: "fx_slash_arc", count: 6, label: "刀光" },
                { prefix: "fx_hit_physical", count: 6, label: "物理命中" },
            ],
        },
        {
            kind: "fireball",
            sequences: [
                { prefix: "fx_fireball_projectile", count: 8, label: "火球飞行" },
                { prefix: "fx_fireball_impact", count: 10, label: "火球命中" },
            ],
        },
        { kind: "heal-aura", sequences: [{ prefix: "fx_heal_aura", count: 10, label: "治疗光环" }] },
        {
            kind: "arcane-bolt",
            sequences: [
                { prefix: "fx_arcane_projectile", count: 8, label: "奥术弹道" },
                { prefix: "fx_arcane_impact", count: 8, label: "奥术命中" },
            ],
        },
        {
            kind: "shadow-bolt",
            sequences: [
                { prefix: "fx_shadow_projectile", count: 8, label: "暗影弹道" },
                { prefix: "fx_shadow_impact", count: 8, label: "暗影命中" },
            ],
        },
        {
            kind: "holy-bolt",
            sequences: [
                { prefix: "fx_holy_projectile", count: 8, label: "圣光弹道" },
                { prefix: "fx_holy_impact", count: 8, label: "圣光命中" },
            ],
        },
        {
            kind: "totem-bolt",
            sequences: [
                { prefix: "fx_totem_projectile", count: 8, label: "图腾弹道" },
                { prefix: "fx_totem_impact", count: 8, label: "图腾命中" },
            ],
        },
    ];
    for (const spec of specs) {
        if (!usedKinds.has(spec.kind)) continue;
        for (const sequence of spec.sequences) {
            for (let index = 0; index < sequence.count; index++) {
                const frame = `${sequence.prefix}_${pad2(index)}.png`;
                if (!deps.exists(join(dir, frame))) {
                    issues.push({ severity: "error", code: "asset-frame-missing", message: `${sequence.label}序列帧缺失: animations/auto-battle/${frame}` });
                }
            }
        }
    }
    if (!usedKinds.has("explosion")) {
        issues.push({ severity: "warning", code: "asset-kind-unused", message: "skill-effects 无 kind=explosion 条目（爆炸帧校验跳过）" });
    }
    return issues;
}
