import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hasHelp, parseArgs } from "../lib/args";
import { expectedGeneratedModule, GENERATED_FILE, loadI18n, validateI18n } from "../lib/i18n";
import { repoRoot } from "../lib/project";
import { ALL_SCHEMAS } from "../lib/schemas";
import { validateContent } from "../lib/validate";

export const help = "validate —— 校验 assets/game-content 配置（schema/跨表引用/id 唯一/内嵌文本禁令）+ i18n 完整性 + 生成物 freshness，非零退出";

export async function run(argv: readonly string[]): Promise<number> {
    const parsed = parseArgs(argv);
    if (hasHelp(parsed)) {
        console.log(help);
        return 0;
    }
    const project = repoRoot();
    const i18n = loadI18n(project);
    const issues = [...validateContent(project, ALL_SCHEMAS, i18n), ...(i18n === null ? [] : validateI18n(i18n))];

    // 生成物 freshness（对齐 gen-constants 模式）：语言表变更后未重跑 gen-i18n 报 error
    const expected = expectedGeneratedModule(project);
    if (expected !== null) {
        const target = join(project, GENERATED_FILE);
        if (!existsSync(target)) {
            issues.push({ severity: "error", code: "i18n-generated-missing", message: `生成物缺失: ${GENERATED_FILE}（运行 bun run content gen-i18n）` });
        } else if (readFileSync(target, "utf8") !== expected) {
            issues.push({ severity: "error", code: "i18n-generated-stale", message: `生成物过期: ${GENERATED_FILE} 与语言表不一致（运行 bun run content gen-i18n）` });
        }
    }

    for (const issue of issues) {
        const tag = issue.severity === "error" ? "error" : "warning";
        console.error(`[${tag}] ${issue.message}`);
    }

    const errors = issues.filter((i) => i.severity === "error").length;
    const warnings = issues.filter((i) => i.severity === "warning").length;
    if (errors === 0) {
        console.log(`[content:validate] 通过：${issues.length === 0 ? "无问题" : `${warnings} 个 warning`}`);
        return 0;
    }
    console.error(`[content:validate] 失败：${errors} 个 error / ${warnings} 个 warning`);
    return 1;
}
