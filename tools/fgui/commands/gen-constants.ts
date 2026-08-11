import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { flagString, hasHelp, parseArgs } from "../lib/args";
import { listPackages, locateProject, readPackage, type FguiProject } from "../lib/fgui";

export const help = "gen-constants —— 生成 FGUI exported 组件 URL 常量表（ui://<包名>/<资源名> 名字格式）到 assets/ui/generated/";

interface GeneratedFile {
    readonly pkg: string;
    readonly file: string;
    readonly lines: readonly string[];
}

/** 官方库包：示例在 third-party/fairygui 子模块，主仓库不生成其常量（与 validate 豁免一致）。 */
const OFFICIAL_PACKAGES = new Set(["Basic", "Builder"]);

/** 包名/资源名转 PascalCase：连接符与空白剔除，各段首字母大写。 */
function toPascalCase(name: string): string {
    return name
        .split(/[-_\s]+/)
        .filter((s) => s.length > 0)
        .map((s) => s[0]!.toUpperCase() + s.slice(1))
        .join("");
}

/** 解析工程全部包，生成每包一份 exported 组件常量清单（确定性：按包名/资源 id 排序）。 */
export function generateConstants(project: FguiProject): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    for (const pkgName of listPackages(project).sort()) {
        if (OFFICIAL_PACKAGES.has(pkgName)) continue;
        const pkg = readPackage(project, pkgName);
        const exported = pkg.resources
            .filter((r) => r.kind === "component" && r.exported)
            .sort((a, b) => a.id.localeCompare(b.id));
        if (exported.length === 0) continue;
        const lines: string[] = [];
        lines.push(`// 由 \`bun run fgui gen-constants\` 生成，禁止手改；源 XML 变更后重跑刷新。`);
        lines.push(`// 包: ${pkg.name} (id=${pkg.id})`);
        for (const r of exported) {
            const constantName = `Ui${toPascalCase(pkg.name)}${toPascalCase(r.name.replace(/\.xml$/i, ""))}`;
            const resourceName = r.name.replace(/\.xml$/i, "");
            const url = `ui://${pkg.name}/${resourceName}`;
            lines.push(`export const ${constantName} = "${url}";`);
        }
        const file = join(project.root, "assets", "ui", "generated", `ui-${pkg.name.toLowerCase()}.ts`);
        files.push({ pkg: pkg.name, file, lines });
    }
    return files;
}

export async function run(argv: readonly string[]): Promise<number> {
    const parsed = parseArgs(argv);
    if (hasHelp(parsed)) {
        console.log(help);
        return 0;
    }
    const project = locateProject(flagString(parsed, "project"));
    const files = generateConstants(project);
    let written = 0;
    const outDir = join(project.root, "assets", "ui", "generated");
    mkdirSync(outDir, { recursive: true });
    for (const f of files) {
        writeFileSync(f.file, `${f.lines.join("\n")}\n`, "utf8");
        written++;
        console.log(`[fgui:gen-constants] 生成 ${f.pkg}: ${f.lines.length - 2} 个常量 → ${f.file}`);
    }
    console.log(`[fgui:gen-constants] 共生成 ${written} 个包常量文件`);
    return 0;
}
