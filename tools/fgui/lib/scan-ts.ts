import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { listPackages, readPackage, type FguiProject } from "./fgui";

export interface TsUrlIssue {
    readonly file: string;
    readonly line: number;
    readonly severity: "warning" | "error";
    readonly message: string;
}

/** 从一行源码提取字符串字面量中的 ui:// URL（单双引号/模板串；排除注释行）。 */
function extractUrlsFromLine(line: string): string[] {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return [];
    const urls: string[] = [];
    const re = /["'`](ui:\/\/[a-zA-Z0-9/]+)["'`]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) urls.push(m[1]!);
    return urls;
}

/** 递归收集目录下所有 .ts 文件相对 base 的路径。 */
function collectTsFiles(base: string, dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...collectTsFiles(base, full));
        else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(relative(base, full));
    }
    return out;
}

/** 官方库包：示例在 third-party/fairygui 子模块，不参与已知常量映射（与 gen-constants 一致）。 */
const OFFICIAL_PACKAGES = new Set(["Basic", "Builder"]);

/** 从全包 exported 组件构建名字格式 URL → 常量名映射（与 gen-constants 同源）。 */
function buildKnownUrls(project: FguiProject): Map<string, string> {
    const known = new Map<string, string>();
    for (const pkgName of listPackages(project)) {
        if (OFFICIAL_PACKAGES.has(pkgName)) continue;
        const pkg = readPackage(project, pkgName);
        for (const r of pkg.resources) {
            if (r.kind !== "component" || !r.exported) continue;
            const resourceName = r.name.replace(/\.xml$/i, "");
            known.set(`ui://${pkg.name}/${resourceName}`, `Ui${pkgName}${resourceName}`);
        }
    }
    return known;
}

/** 判断 ui:// URL 是否为短 id 格式（`ui://<pkgId><resId>`，无 `/` 分隔）。 */
function isShortIdUrl(url: string): boolean {
    const rest = url.slice(5); // 去掉 "ui://"
    return rest.indexOf("/") === -1;
}

/**
 * 扫描 project.root 下 assets/ 与 tests/ 中的裸 ui:// 字符串并映射到已生成常量。
 * 匹配到生成常量 → warning（建议改用常量）；未登记 → error（资源名检查或重跑 gen-constants）；
 * 短 id 格式 → warning（原则禁用，一律用 ui/generated/ 名字格式常量）。
 * 生成产物目录 assets/ui/generated/ 自身排除。
 */
export function scanTsRawUrls(project: FguiProject): TsUrlIssue[] {
    const issues: TsUrlIssue[] = [];
    const known = buildKnownUrls(project);
    const generatedPrefix = join("assets", "ui", "generated").replace(/\\/g, "/");
    for (const sub of ["assets", "tests"]) {
        const root = join(project.root, sub);
        if (!existsSync(root)) continue;
        for (const file of collectTsFiles(project.root, root)) {
            const norm = file.replace(/\\/g, "/");
            if (norm.startsWith(generatedPrefix)) continue;
            const lines = readFileSync(join(project.root, norm), "utf8").split("\n");
            for (let i = 0; i < lines.length; i++) {
                for (const url of extractUrlsFromLine(lines[i]!)) {
                    if (isShortIdUrl(url)) {
                        issues.push({
                            file: norm,
                            line: i + 1,
                            severity: "warning",
                            message: `短 id 格式的 ui:// URL "${url}" 原则禁用，请改用 ui/generated/ 中的名字格式常量`,
                        });
                        continue;
                    }
                    const constantName = known.get(url);
                    const msg = constantName
                        ? `建议改用生成常量 ${constantName}（裸 ui:// URL 应引用 ui/generated/ 产物）`
                        : `未登记的 ui:// URL "${url}"（检查资源名或先重跑 gen-constants）`;
                    issues.push({ file: norm, line: i + 1, severity: constantName ? "warning" : "error", message: msg });
                }
            }
        }
    }
    return issues;
}
