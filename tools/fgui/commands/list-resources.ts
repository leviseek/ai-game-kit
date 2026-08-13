import { flagString, hasHelp, parseArgs, requireFlag } from "../lib/args";
import { locateProject, readPackage } from "../lib/fgui";

export const help = "list-resources —— 列出包的资源清单（id/名称/路径/导出/九宫格）";

export async function run(argv: readonly string[]): Promise<number> {
    const parsed = parseArgs(argv);
    if (hasHelp(parsed)) {
        console.log(help);
        return 0;
    }

    const packageName = requireFlag(parsed, "package", "list-resources --package <包名>");
    const projectArg = flagString(parsed, "project");
    const project = locateProject(projectArg);
    const pkg = readPackage(project, packageName);

    if (pkg.resources.length === 0) {
        console.log(`[fgui:list-resources] 包 ${packageName} 无资源`);
        return 0;
    }

    console.log(`包: ${pkg.name} (id=${pkg.id}) 资源数: ${pkg.resources.length}`);
    for (const r of pkg.resources) {
        const fields = [r.kind.padEnd(9), r.id.padEnd(6), r.name, `@${r.path}`, r.exported ? "export" : "", r.scale9grid ? `scale9grid=${r.scale9grid}` : ""];
        console.log(fields.filter(Boolean).join("  "));
    }
    return 0;
}
