import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { hasHelp, parseArgs } from "../lib/args";
import { expectedGeneratedModule, GENERATED_FILE, loadI18n } from "../lib/i18n";
import { repoRoot } from "../lib/project";

export const help = "gen-i18n —— 生成 assets/game-content/generated/i18n.ts（key 联合 + TextRepo + 主语言默认值）";

export async function run(argv: readonly string[]): Promise<number> {
    const parsed = parseArgs(argv);
    if (hasHelp(parsed)) {
        console.log(help);
        return 0;
    }
    const project = repoRoot();
    const i18n = loadI18n(project);
    if (i18n === null) {
        console.error(`[content:gen-i18n] 缺少主语言表 ${GENERATED_FILE.split("/").slice(0, -1).join("/")}/zh-CN.json，无法生成`);
        return 1;
    }

    const content = expectedGeneratedModule(project);
    if (content === null) {
        console.error("[content:gen-i18n] 生成失败：语言表不可读");
        return 1;
    }
    const target = join(project, GENERATED_FILE);
    const unchanged = existsSync(target) && readFileSync(target, "utf8") === content;
    if (!unchanged) {
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content, "utf8");
        console.log(`[content:gen-i18n] 已生成 ${GENERATED_FILE}`);
        return 0;
    }
    console.log(`[content:gen-i18n] 无变化（${GENERATED_FILE} 已是最新）`);
    return 0;
}
