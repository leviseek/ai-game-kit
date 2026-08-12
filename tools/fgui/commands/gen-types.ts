import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { flagString, hasHelp, parseArgs } from "../lib/args";
import {
    collectDisplayElements,
    listPackages,
    locateProject,
    readComponent,
    readPackage,
    type DisplayElementInfo,
    type FguiProject,
} from "../lib/fgui";

export const help = "gen-types —— 生成 FGUI exported 组件类型描述（字段描述/节点名联合/declaration merging interface）到 assets/ui/generated/";

/** 官方库包：示例在 third-party/fairygui 子模块，主仓库不生成其类型（与 validate 豁免一致）。 */
const OFFICIAL_PACKAGES = new Set(["Basic", "Builder"]);

/** 能力 kind：FGUI 运行时对象类型 → 引擎无关能力接口的映射键。 */
export type ElementKind =
    | "button" | "input" | "progress" | "text" | "richText"
    | "list" | "component" | "image" | "movieclip";

/** 元件 XML 特征 → 能力 kind 映射（设计 D2）。 */
export function elementKindOf(element: DisplayElementInfo): ElementKind | undefined {
    switch (element.nodeName) {
        case "text":
            if (element.isInput) return "input";
            return "text";
        case "image":
            return "image";
        case "list":
            return "list";
        case "movieclip":
            return "movieclip";
        case "component":
            if (element.extension === "Button") return "button";
            if (element.extension === "ProgressBar") return "progress";
            return "component";
        case "loader":
            return "component";
        default:
            // graph/未知节点不生成绑定（graph 项目已禁用）
            return undefined;
    }
}

/** 能力 kind → 引擎无关能力接口名（生成 declaration merging interface 用）。 */
const CAPABILITY_OF_KIND: Readonly<Record<ElementKind, string>> = {
    button: "TypedButtonNode",
    input: "TypedInputNode",
    progress: "TypedProgressNode",
    text: "TypedTextNode",
    richText: "TypedTextNode",
    list: "TypedListNode",
    component: "TypedComponentNode",
    image: "TypedImageNode",
    movieclip: "TypedComponentNode",
};

interface GeneratedTypesFile {
    readonly pkg: string;
    readonly file: string;
    readonly lines: readonly string[];
}

/** 生成产物文件头：禁止手改标记 + 包信息（与 gen-constants 同族）。 */
const HEADER = [
    "// 由 `bun run fgui gen-types` 生成，禁止手改；源 XML 变更后重跑刷新。",
];

/** 每包生成一份类型描述文件（确定性：包名/资源 id 排序，元件按 XML 顺序）。 */
export function generateTypeFiles(project: FguiProject): GeneratedTypesFile[] {
    const files: GeneratedTypesFile[] = [];
    for (const pkgName of listPackages(project).sort()) {
        if (OFFICIAL_PACKAGES.has(pkgName)) continue;
        const pkg = readPackage(project, pkgName);
        const exported = pkg.resources
            .filter((r) => r.kind === "component" && r.exported)
            .sort((a, b) => a.id.localeCompare(b.id));
        if (exported.length === 0) continue;

        const lines: string[] = [...HEADER, `// 包: ${pkg.name} (id=${pkg.id})`, ""];
        const capabilities = new Set<string>();
        const sections: string[] = [];

        for (const r of exported) {
            const componentName = r.name.replace(/\.xml$/i, "");
            const component = readComponent(project, pkgName, componentName);
            const elements = collectDisplayElements(component)
                .map((el) => ({ el, kind: elementKindOf(el) }))
                .filter((e): e is { el: DisplayElementInfo; kind: ElementKind } => e.kind !== undefined);

            if (elements.length === 0) continue;

            // 顺序：先 Fields（数据源），再派生 Nodes（keyof typeof），最后 interface
            sections.push(`export const ${componentName}Fields = {`);
            for (const { el, kind } of elements) {
                sections.push(`    ${el.name}: "${kind}",`);
            }
            sections.push(`} as const;`);
            sections.push("");
            // Nodes 从 Fields 派生：同一元件名集合不重复承载（供 @FClick 泛型约束）
            sections.push(`export type ${componentName}Nodes = keyof typeof ${componentName}Fields;`);
            sections.push("");
            // declaration merging interface：加 I 前缀区分"生成形状类型"与"业务类"
            sections.push(`export interface I${componentName} {`);
            for (const { el, kind } of elements) {
                const capability = CAPABILITY_OF_KIND[kind];
                capabilities.add(capability);
                sections.push(`    readonly _${el.name}: ${capability};`);
            }
            sections.push(`}`);
            sections.push("");
        }

        if (sections.length === 0) continue;

        // import 能力接口类型：生成文件依赖框架根入口的能力接口族
        lines.push(`import type {`);
        for (const capability of [...capabilities].sort()) {
            lines.push(`    ${capability},`);
        }
        lines.push(`} from "../../framework";`);
        lines.push("");
        lines.push(...sections);

        const file = join(project.root, "assets", "ui", "generated", `ui-${pkg.name.toLowerCase()}-types.ts`);
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
    const files = generateTypeFiles(project);
    let written = 0;
    const outDir = join(project.root, "assets", "ui", "generated");
    mkdirSync(outDir, { recursive: true });
    for (const f of files) {
        writeFileSync(f.file, `${f.lines.join("\n")}\n`, "utf8");
        written++;
        console.log(`[fgui:gen-types] 生成 ${f.pkg}: ${f.lines.length - 2} 行 → ${f.file}`);
    }
    console.log(`[fgui:gen-types] 共生成 ${written} 个包类型文件`);
    return 0;
}
