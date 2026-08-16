import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ContentIssue } from "./schemas/types";

/** 语言表目录（相对仓库根）。 */
export const I18N_DIR = "assets/game-content/i18n";
/** 主语言：key 权威（其余语言为翻译表）。 */
export const MAIN_LANG = "zh-CN";
/** 生成物路径（相对仓库根）。 */
export const GENERATED_FILE = "assets/game-content/generated/i18n.ts";

export interface LanguageTable {
    readonly lang: string;
    readonly entries: Record<string, string>;
}

export interface I18nState {
    readonly dir: string;
    readonly main: LanguageTable;
    readonly translations: readonly LanguageTable[];
}

/** i18n key 格式：小写点分路径（如 auto_battle.buffs.attack-up.name；段允许下划线/连字符）。 */
const KEY_RE = /^[a-z0-9_]+(\.[a-z0-9_-]+)+$/;

export function isI18nKeyFormat(value: string): boolean {
    return KEY_RE.test(value);
}

/** 提取命名占位符集合（{name} 等）。 */
export function placeholderSet(text: string): Set<string> {
    const set = new Set<string>();
    for (const match of text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)) {
        set.add(match[1]!);
    }
    return set;
}

/** 读取 i18n 目录：主语言必填，其余语言为翻译表；目录缺失返回 null。 */
export function loadI18n(projectRoot: string): I18nState | null {
    const dir = join(projectRoot, I18N_DIR);
    if (!existsSync(dir)) return null;
    const tables: LanguageTable[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const lang = entry.name.replace(/\.json$/, "");
        let entries: Record<string, string>;
        try {
            entries = JSON.parse(readFileSync(join(dir, entry.name), "utf8")) as Record<string, string>;
        } catch {
            continue;
        }
        tables.push({ lang, entries });
    }
    const main = tables.find((t) => t.lang === MAIN_LANG);
    if (main === undefined) return null;
    return {
        dir,
        main,
        translations: tables.filter((t) => t.lang !== MAIN_LANG),
    };
}

/** 全部 key（主语言）。 */
export function i18nKeys(state: I18nState): string[] {
    return Object.keys(state.main.entries).sort();
}

/**
 * 跨语言完整性 + 占位符一致性：
 * - 翻译表缺主语言 key → error；多余 key → warning；
 * - 命名占位符集合与主语言不一致（缺参/多参/名不同）→ error（忽略顺序）。
 */
export function validateI18n(state: I18nState): ContentIssue[] {
    const issues: ContentIssue[] = [];
    const mainKeys = new Set(Object.keys(state.main.entries));
    for (const translation of state.translations) {
        const lang = translation.lang;
        for (const key of mainKeys) {
            if (!(key in translation.entries)) {
                issues.push({ severity: "error", code: "i18n-missing-key", message: `[${lang}] 缺少主语言 key: ${key}` });
            }
        }
        for (const key of Object.keys(translation.entries)) {
            if (!mainKeys.has(key)) {
                issues.push({ severity: "warning", code: "i18n-extra-key", message: `[${lang}] 多余 key（主语言不存在）: ${key}` });
            }
        }
        for (const key of mainKeys) {
            const mainText = state.main.entries[key] ?? "";
            const text = translation.entries[key];
            if (text === undefined) continue;
            const mainPlaceholders = placeholderSet(mainText);
            const placeholders = placeholderSet(text);
            if (!setsEqual(mainPlaceholders, placeholders)) {
                issues.push({
                    severity: "error",
                    code: "i18n-placeholder-mismatch",
                    message: `[${lang}] key ${key} 占位符与主语言不一致（主: ${[...mainPlaceholders].join(",") || "无"} / 译: ${[...placeholders].join(",") || "无"}）`,
                });
            }
        }
    }
    return issues;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const item of a) {
        if (!b.has(item)) return false;
    }
    return true;
}

/**
 * 生成 generated/i18n.ts 内容：key 联合类型、主语言默认值表、TextRepo（未知 key fail-fast）。
 * 生成物禁止手改；freshness 由 content validate 强制（对齐 gen-constants 模式）。
 */
export function generateI18nModule(state: I18nState): string {
    const keys = i18nKeys(state);
    const keyLines = keys.map((key) => `    | "${key}"`).join("\n");
    const zhLines = keys.map((key) => `    "${key}": ${JSON.stringify(state.main.entries[key] ?? "")}`).join(",\n");
    return `// 由 bun run content gen-i18n 生成，禁止手改；源：${I18N_DIR}/${MAIN_LANG}.json
export type I18nKey =
${keyLines};

export const I18N_KEYS: readonly I18nKey[] = [
${keys.map((key) => `    "${key}",`).join("\n")}
] as const;

/** 主语言（zh-CN）默认文案表。 */
export const zhCN: Record<I18nKey, string> = {
${zhLines}
};

export interface LanguageTableEntry {
    readonly lang: string;
    readonly entries: Record<string, string>;
}

/** 文案仓库：按 key 取文案；未知 key fail-fast（含最近相似 key 提示，不静默回退空串）。 */
export class TextRepo {
    private readonly tables: readonly LanguageTableEntry[];

    constructor(tables: readonly LanguageTableEntry[] = [{ lang: "zh-CN", entries: zhCN }]) {
        this.tables = tables;
    }

    has(key: string): boolean {
        return key in zhCN;
    }

    get(key: string, lang?: string): string {
        if (key in zhCN) {
            if (lang === undefined || lang === "zh-CN") return zhCN[key as I18nKey] ?? "";
            const table = this.tables.find((t) => t.lang === lang);
            if (table !== undefined && key in table.entries) return table.entries[key] ?? "";
            return zhCN[key as I18nKey] ?? ""; // 翻译缺 key 回退主语言（完整性已由 content validate 拦截）
        }
        throw new TextNotFoundError(key, nearestKey(key, I18N_KEYS));
    }

    getOr(key: string, fallback: string): string {
        return key in zhCN ? this.get(key) : fallback;
    }
}

export class TextNotFoundError extends Error {
    constructor(public readonly key: string, public readonly nearest: string | null) {
        super(nearest === null ? \`未知文案 key: \${key}\` : \`未知文案 key: \${key}（最近相似 key: \${nearest}）\`);
        this.name = "TextNotFoundError";
    }
}

function nearestKey(key: string, keys: readonly string[]): string | null {
    if (keys.length === 0) return null;
    let best: string | null = null;
    let bestScore = -1;
    for (const candidate of keys) {
        const score = similarity(key, candidate);
        if (score > bestScore) {
            bestScore = score;
            best = candidate;
        }
    }
    return best;
}

/** 轻量相似度：共享段长度（以 . 分段） + 字符级前缀命中。 */
function similarity(a: string, b: string): number {
    const aSegs = a.split(".");
    const bSegs = b.split(".");
    let score = 0;
    const n = Math.min(aSegs.length, bSegs.length);
    for (let i = 0; i < n; i++) {
        if (aSegs[i] === bSegs[i]) score += 10;
    }
    let prefix = 0;
    const len = Math.min(a.length, b.length);
    while (prefix < len && a[prefix] === b[prefix]) prefix++;
    return score + prefix;
}

/** 默认实例：主语言文案仓库（游戏侧展示层直接使用；多语言可 new TextRepo([...]) 注入）。 */
export const text: TextRepo = new TextRepo();
`;
}

/** 重算期望生成物内容（供 freshness 对比）。 */
export function expectedGeneratedModule(projectRoot: string): string | null {
    const state = loadI18n(projectRoot);
    if (state === null) return null;
    return generateI18nModule(state);
}
