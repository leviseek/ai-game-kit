// 由 bun run content gen-i18n 生成，禁止手改；源：assets/game-content/i18n/zh-CN.json
export type I18nKey =
    | "auto_battle.buffs.attack-up.name"
    | "auto_battle.buffs.defense-up.name"
    | "auto_battle.buffs.poison.name"
    | "auto_battle.heroes.ally-mage.name"
    | "auto_battle.heroes.ally-priest.name"
    | "auto_battle.heroes.ally-tank.name"
    | "auto_battle.heroes.enemy-mage.name"
    | "auto_battle.heroes.enemy-shaman.name"
    | "auto_battle.heroes.enemy-tank.name"
    | "auto_battle.skills.ally-mage-skill.name"
    | "auto_battle.skills.ally-priest-skill.name"
    | "auto_battle.skills.ally-tank-skill.name"
    | "auto_battle.skills.enemy-mage-skill.name"
    | "auto_battle.skills.enemy-shaman-skill.name"
    | "auto_battle.skills.enemy-tank-skill.name";

export const I18N_KEYS: readonly I18nKey[] = [
    "auto_battle.buffs.attack-up.name",
    "auto_battle.buffs.defense-up.name",
    "auto_battle.buffs.poison.name",
    "auto_battle.heroes.ally-mage.name",
    "auto_battle.heroes.ally-priest.name",
    "auto_battle.heroes.ally-tank.name",
    "auto_battle.heroes.enemy-mage.name",
    "auto_battle.heroes.enemy-shaman.name",
    "auto_battle.heroes.enemy-tank.name",
    "auto_battle.skills.ally-mage-skill.name",
    "auto_battle.skills.ally-priest-skill.name",
    "auto_battle.skills.ally-tank-skill.name",
    "auto_battle.skills.enemy-mage-skill.name",
    "auto_battle.skills.enemy-shaman-skill.name",
    "auto_battle.skills.enemy-tank-skill.name",
] as const;

/** 主语言（zh-CN）默认文案表。 */
export const zhCN: Record<I18nKey, string> = {
    "auto_battle.buffs.attack-up.name": "攻击强化",
    "auto_battle.buffs.defense-up.name": "防御强化",
    "auto_battle.buffs.poison.name": "中毒",
    "auto_battle.heroes.ally-mage.name": "法师",
    "auto_battle.heroes.ally-priest.name": "牧师",
    "auto_battle.heroes.ally-tank.name": "坦克",
    "auto_battle.heroes.enemy-mage.name": "巫妖",
    "auto_battle.heroes.enemy-shaman.name": "萨满",
    "auto_battle.heroes.enemy-tank.name": "骷髅",
    "auto_battle.skills.ally-mage-skill.name": "火球",
    "auto_battle.skills.ally-priest-skill.name": "治疗",
    "auto_battle.skills.ally-tank-skill.name": "重击",
    "auto_battle.skills.enemy-mage-skill.name": "暗影",
    "auto_battle.skills.enemy-shaman-skill.name": "妖术",
    "auto_battle.skills.enemy-tank-skill.name": "爪击"
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
        super(nearest === null ? `未知文案 key: ${key}` : `未知文案 key: ${key}（最近相似 key: ${nearest}）`);
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
