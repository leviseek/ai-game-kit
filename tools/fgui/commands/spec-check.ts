import { readFileSync } from "node:fs";
import { hasHelp, parseArgs, requireFlag } from "../lib/args";
import { validateSpec } from "../lib/spec";

export const help = "spec-check —— 校验 UI spec JSON（字号档位/组件类型决策/graph 与 transition 禁令/relation sidePair/命名），硬规则 error 非零退出";

const FONT_TIER_HINT = "12/14/16/18/20/24/28/32/40";

export async function run(argv: readonly string[]): Promise<number> {
    const parsed = parseArgs(argv);
    if (hasHelp(parsed)) {
        console.log(help);
        return 0;
    }

    const specFile = requireFlag(parsed, "spec", "spec-check --spec <spec.json>");
    let input: unknown;
    try {
        input = JSON.parse(readFileSync(specFile, "utf8"));
    } catch (error) {
        console.error(`[fgui:spec-check] 无法读取/解析 spec 文件 "${specFile}": ${error instanceof Error ? error.message : String(error)}`);
        return 2;
    }

    const issues = validateSpec(input);
    const errors = issues.filter((i) => i.severity === "error");
    const warnings = issues.filter((i) => i.severity === "warning");

    for (const issue of issues) {
        const tag = issue.severity === "error" ? "error" : "warning";
        console.error(`[${tag}] ${issue.message}`);
    }

    if (errors.length === 0) {
        console.log(`[fgui:spec-check] 通过：${issues.length === 0 ? "无问题" : `${warnings.length} 个 warning`}`);
        return 0;
    }
    console.error(`[fgui:spec-check] 失败：${errors.length} 个 error / ${warnings.length} 个 warning`);
    console.error(`[fgui:spec-check] 提示：非档位字号请用最近档位（${FONT_TIER_HINT}），修正后重新校验`);
    return 1;
}
