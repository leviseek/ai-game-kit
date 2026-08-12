import { flagString, flagBool, hasHelp, parseArgs, requireFlag } from "../lib/args";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
    findExportedComponentNameConflicts,
    findResourceIdConflicts,
    locateProject,
    readComponent,
    readPackage,
    validateComponent,
    validateComponentSemantics,
    validatePackageFileIntegrity,
    validatePackageManifest,
    type ValidationIssue,
} from "../lib/fgui";
import { scanTsRawUrls } from "../lib/scan-ts";
import { generateTypeFiles } from "./gen-types";

export const help = "validate —— 校验包/组件引用完整性与语义（默认跳过官方库 Basic/Builder，--strict 全量）；同时跨包查重导出组件名、校验 gen-types 产物与源 XML 一致";

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

    // 官方库包按名默认豁免（与 gen-constants/scan-ts 同源）：Basic/Builder 示例已由
    // third-party/fairygui 子模块提供，不要求存在于主仓库工程；--strict 时要求真实包
    if (!strict && OFFICIAL_PACKAGES.has(packageName)) {
        console.log(`[fgui:validate] ${packageName} 为官方库包（默认豁免），使用 --strict 可全量检查`);
        return 0;
    }

    const pkg = readPackage(project, packageName);

    let exitCode = 0;

    // 0. 跨包查重导出组件名：同名组件按「包+组件名」复合键定位不会运行时冲突，
    //    但会为未来按名全局生成绑定埋下冲突，故全工程强制唯一。
    const nameConflicts = findExportedComponentNameConflicts(project);
    for (const [name, packages] of nameConflicts) {
        console.error(`[error] 导出组件名跨包重复: "${name}"（${packages.join(", ")}）`);
        exitCode = 1;
    }

    // 1. 包级校验：资源 id 冲突 + 登记文件存在 + 包清单
    const dupIds = findResourceIdConflicts(pkg);
    for (const id of dupIds) {
        console.error(`[error] 资源 id 重复: "${id}"`);
        exitCode = 1;
    }
    const manifestIssues = validatePackageManifest(project, pkg);
    for (const issue of manifestIssues) {
        console.error(`[${issue.severity}] ${issue.message}`);
        if (issue.severity === "error") exitCode = 1;
    }
    const integrityIssues = validatePackageFileIntegrity(project, pkg);
    for (const issue of integrityIssues) {
        console.error(`[${issue.severity}] ${issue.message}`);
        if (issue.severity === "error") exitCode = 1;
    }

    // 1b. 全工程 TS 源码裸 ui:// URL 扫描（assets/ 与 tests/，生成产物目录除外）
    const tsIssues = scanTsRawUrls(project);
    for (const issue of tsIssues) {
        console.error(`[${issue.severity}] ${issue.file}:${issue.line} ${issue.message}`);
        if (issue.severity === "error") exitCode = 1;
    }

    // 1c. gen-types 产物 freshness：重跑解析逻辑与磁盘 `ui-<包>-types.ts` 逐字对比。
    //     组件名/字段增减或 kind 变化而未重跑 gen-types 时此处失败，阻断提交。
    const typeIssues = checkTypeFreshness(project);
    for (const issue of typeIssues) {
        console.error(`[${issue.severity}] ${issue.message}`);
        if (issue.severity === "error") exitCode = 1;
    }

    // 2. 组件校验：单个组件或全部组件（引用完整性 + 语义校验）
    const targets = componentName ? [componentName] : collectComponentNames(pkg);
    for (const name of targets) {
        const component = readComponent(project, packageName, name);
        const issues = [
            ...validateComponent(project, pkg, component),
            ...validateComponentSemantics(project, pkg, component),
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

/** 校验 gen-types 产物与源 XML 一致：重算期望内容并逐字对比磁盘产物（设计 D3）。 */
export function checkTypeFreshness(
    project: ReturnType<typeof locateProject>,
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const expected = generateTypeFiles(project);
    const generatedDir = resolve(project.root, "assets", "ui", "generated");

    // 期望产物必须存在于磁盘且内容一致
    for (const file of expected) {
        if (!existsSync(file.file)) {
            issues.push({
                severity: "error",
                message: `gen-types 产物缺失: ${file.file}（先运行 bun run fgui gen-types）`,
            });
            continue;
        }
        const actual = readFileSync(file.file, "utf8").replace(/\n$/, "");
        const want = file.lines.join("\n");
        if (actual !== want) {
            issues.push({
                severity: "error",
                message: `gen-types 产物过期: ${file.file} 与源 XML 不一致（改名/删元件后须重跑 bun run fgui gen-types）`,
            });
        }
    }

    // 磁盘存在但不在期望清单内的产物（包已无 exported 组件或包删除）视为脏文件
    if (existsSync(generatedDir)) {
        for (const entry of readdirSync(generatedDir, { withFileTypes: true })) {
            if (!entry.isFile() || !entry.name.endsWith("-types.ts")) continue;
            const full = resolve(generatedDir, entry.name);
            if (!expected.some((f) => f.file === full)) {
                issues.push({
                    severity: "error",
                    message: `多余的 gen-types 产物: ${full}（包/组件已不存在，运行 bun run fgui gen-types 不会生成；请删除）`,
                });
            }
        }
    }

    return issues;
}
