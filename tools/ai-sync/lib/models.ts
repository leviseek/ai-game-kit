import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ManifestIssue } from "./manifest";

/** 模型注册表条目：primary 必填；fallback 为 null 表示未配置降级。 */
export interface ModelEntry {
    readonly primary: string;
    readonly fallback: string | null;
}

/** 角色 → 模型条目。 */
export type Models = Readonly<Record<string, ModelEntry>>;

export const MODELS_FILE = "registry/models.json";
export const AGENTS_DIR = "registry/agents";

const PLACEHOLDER_RE = /\{\{model:([a-zA-Z0-9_-]+)\}\}/g;
const PLACEHOLDER_LEFT = "{{model:";

/** 读取模型注册表；文件缺失时返回空表（由 validateAgentTemplates 兜底报未知角色）。 */
export function loadModels(aiSyncRoot: string): Models {
    const file = join(aiSyncRoot, MODELS_FILE);
    if (!existsSync(file)) return {};
    return JSON.parse(readFileSync(file, "utf8")) as Models;
}

/** 结构校验：角色 id 格式、primary 必填、fallback 必须为非空字符串或 null。 */
export function validateModels(models: Models): ManifestIssue[] {
    const issues: ManifestIssue[] = [];
    for (const [role, entry] of Object.entries(models)) {
        if (!/^[a-z0-9][a-z0-9-]*$/.test(role)) {
            issues.push({ severity: "error", code: "invalid-role", message: `模型角色 id 非法: "${role}"（应为小写 kebab-case）` });
        }
        if (typeof entry.primary !== "string" || entry.primary.length === 0) {
            issues.push({ severity: "error", code: "empty-primary", message: `模型角色 "${role}" 未声明 primary` });
        }
        if (entry.fallback !== null && (typeof entry.fallback !== "string" || entry.fallback.length === 0)) {
            issues.push({ severity: "error", code: "invalid-fallback", message: `模型角色 "${role}" 的 fallback 必须为非空字符串或 null` });
        }
    }
    return issues;
}

export interface RenderResult {
    readonly ok: boolean;
    readonly content?: string;
    readonly error?: string;
}

/**
 * 渲染模板占位符 `{{model:<role>}}` → models[role].primary。
 * 未知角色或残留未渲染占位符（如空角色名语法错误）返回 error，不产出半成品内容。
 */
export function renderTemplate(content: string, models: Models): RenderResult {
    const seen = new Set<string>();
    const rendered = content.replace(PLACEHOLDER_RE, (match, role: string) => {
        seen.add(role);
        return models[role] ? models[role].primary : match;
    });
    const unknown = [...seen].filter((role) => !models[role]);
    if (unknown.length > 0) {
        return { ok: false, error: `模板引用未知模型角色: ${unknown.join(", ")}` };
    }
    if (rendered.includes(PLACEHOLDER_LEFT)) {
        return { ok: false, error: "模板残留未渲染占位符（语法错误，如空角色名）" };
    }
    return { ok: true, content: rendered };
}

/** 校验全部 agent 模板可渲染：registry/agents/*.md 的占位符必须能在 models 中解析。 */
export function validateAgentTemplates(aiSyncRoot: string, models: Models): ManifestIssue[] {
    const issues: ManifestIssue[] = [];
    const dir = join(aiSyncRoot, AGENTS_DIR);
    if (!existsSync(dir)) return issues;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const content = readFileSync(join(dir, entry.name), "utf8");
        const result = renderTemplate(content, models);
        if (!result.ok) {
            issues.push({ severity: "error", code: "template-error", message: `agent 模板 ${entry.name} 渲染失败: ${result.error}` });
        }
    }
    return issues;
}
