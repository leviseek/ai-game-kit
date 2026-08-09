import { flagString, flagBool, hasHelp, parseArgs, requireFlag } from "../lib/args";
import {
    findResourceIdConflicts,
    locateProject,
    readComponent,
    readPackage,
    validateComponent,
    validateComponentSemantics,
    validatePackageFileIntegrity,
    validatePackageManifest,
} from "../lib/fgui";

export const help = "validate —— 校验包/组件引用完整性与语义（默认跳过官方库 Basic/Builder，--strict 全量）";

/** 默认豁免的官方库包（含 graph/空页名/transition 等官方原样内容，不修复）。 */
const OFFICIAL_PACKAGES = new Set(["Basic", "Builder"]);

export async function run(argv: readonly string[]): Promise<number> {
    const parsed = parseArgs(argv);
    if (hasHelp(parsed)) {
        console.log(help);
        return 0;
    }

    const packageName = requireFlag(parsed, "package", "validate --package <包名> [--component <组件名>] [--strict]");
    const componentName = flagString(parsed, "component");
    const projectArg = flagString(parsed, "project");
    const strict = flagBool(parsed, "strict", false);
    const project = locateProject(projectArg);
    const pkg = readPackage(project, packageName);

    const official = !strict && OFFICIAL_PACKAGES.has(pkg.name);
    if (official) {
        console.log(`[fgui:validate] ${pkg.name} 为官方库包（默认豁免），使用 --strict 可全量检查`);
    }

    let exitCode = 0;

    // 1. 包级校验：资源 id 冲突 + 登记文件存在 + 包清单
    const dupIds = findResourceIdConflicts(pkg);
    for (const id of dupIds) {
        console.error(`[error] 资源 id 重复: "${id}"`);
        exitCode = 1;
    }
    if (!official) {
        const manifestIssues = validatePackageManifest(project, pkg);
        for (const issue of manifestIssues) {
            console.error(`[${issue.severity}] ${issue.message}`);
            if (issue.severity === "error") exitCode = 1;
        }
    }
    const integrityIssues = validatePackageFileIntegrity(project, pkg);
    for (const issue of integrityIssues) {
        console.error(`[${issue.severity}] ${issue.message}`);
        if (issue.severity === "error") exitCode = 1;
    }

    // 2. 组件校验：单个组件或全部组件（引用完整性 + 语义校验）
    const targets = componentName ? [componentName] : collectComponentNames(pkg);
    for (const name of targets) {
        const component = readComponent(project, packageName, name);
        const issues = [
            ...validateComponent(project, pkg, component),
            ...(official ? [] : validateComponentSemantics(project, pkg, component)),
        ];
        console.log(`校验 ${packageName}/${name}: ${issues.length === 0 ? "通过" : `${issues.length} 个问题`}`);
        for (const issue of issues) {
            console.error(`[${issue.severity}] ${issue.message}`);
            if (issue.severity === "error") exitCode = 1;
        }
    }

    if (exitCode === 0) {
        console.log(`[fgui:validate] ${packageName} 校验通过`);
    } else {
        console.error(`[fgui:validate] ${packageName} 校验失败，见上方问题`);
    }
    return exitCode;
}

/** 从 package.xml 收集组件文件名（不含扩展名）。 */
function collectComponentNames(pkg: ReturnType<typeof readPackage>): string[] {
    return pkg.resources
        .filter((r) => r.kind === "component")
        .map((r) => r.name.replace(/\.xml$/, ""));
}
