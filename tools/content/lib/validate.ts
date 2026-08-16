import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isI18nKeyFormat, type I18nState } from "./i18n";
import { ALL_SCHEMAS, type FieldSpec, type TableSchema, type ContentIssue } from "./schemas";

export interface ValidateDeps {
    readonly readJson: (file: string) => unknown;
    readonly exists: (file: string) => boolean;
}

export const realDeps: ValidateDeps = {
    readJson: (file) => JSON.parse(readFileSync(file, "utf8")),
    exists: (file) => existsSync(file),
};

/** 表内 id 索引（跨表引用解析与 id 唯一性）。 */
export interface TableIndex {
    readonly table: string;
    readonly ids: Set<string>;
}

/**
 * 全量内容校验：schema（类型/必填/枚举/范围）→ id 唯一 → 跨表引用 → i18n-key
 * （格式 + 主语言存在性）。i18n 未初始化时 i18n-key 只做格式校验（中文等非 key 直接 error）。
 */
export function validateContent(projectRoot: string, schemas: readonly TableSchema[], i18n: I18nState | null, deps: ValidateDeps = realDeps): ContentIssue[] {
    const issues: ContentIssue[] = [];
    if (i18n === null) {
        issues.push({ severity: "warning", code: "i18n-not-initialized", message: "assets/game-content/i18n 未初始化（缺少 zh-CN.json 主语言表），i18n-key 仅做格式校验" });
    }

    const indexes: TableIndex[] = [];
    for (const schema of schemas) {
        const file = join(projectRoot, schema.file);
        if (!deps.exists(file)) {
            issues.push({ severity: "error", code: "config-missing", message: `配置缺失: ${schema.file}` });
            continue;
        }
        let value: unknown;
        try {
            value = deps.readJson(file);
        } catch (error) {
            issues.push({ severity: "error", code: "config-parse", message: `配置解析失败: ${schema.file}（${error instanceof Error ? error.message : String(error)}）` });
            continue;
        }
        issues.push(...validateTable(schema, value, i18n, indexes));
    }

    // 跨表引用解析（依赖全部表 id 索引就绪）
    issues.push(...validateCrossRefs(projectRoot, schemas, indexes, deps));
    return issues;
}

function validateTable(schema: TableSchema, value: unknown, i18n: I18nState | null, indexes: TableIndex[]): ContentIssue[] {
    const issues: ContentIssue[] = [];
    const path = schema.file;

    if (schema.shape === "object") {
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
            issues.push({ severity: "error", code: "config-shape", message: `${path} 应为对象` });
            return issues;
        }
        issues.push(...validateFields(schema.fields, value as Record<string, unknown>, i18n, path));
        return issues;
    }

    if (!Array.isArray(value)) {
        issues.push({ severity: "error", code: "config-shape", message: `${path} 应为数组` });
        return issues;
    }

    const idSet = new Set<string>();
    value.forEach((row, index) => {
        const rowPath = `${path}[${index}]`;
        if (row === null || typeof row !== "object" || Array.isArray(row)) {
            issues.push({ severity: "error", code: "config-row", message: `${rowPath} 应为对象` });
            return;
        }
        const record = row as Record<string, unknown>;
        issues.push(...validateFields(schema.fields, record, i18n, rowPath));
        const idValue = record.id;
        if (typeof idValue === "string" && idValue.length > 0) {
            if (idSet.has(idValue)) {
                issues.push({ severity: "error", code: "id-duplicate", message: `${path} id 重复: "${idValue}"（行 ${index}）` });
            }
            idSet.add(idValue);
        }
    });
    indexes.push({ table: schema.table, ids: idSet });
    return issues;
}

function validateFields(fields: readonly FieldSpec[], record: Record<string, unknown>, i18n: I18nState | null, path: string): ContentIssue[] {
    const issues: ContentIssue[] = [];
    for (const field of fields) {
        const fieldPath = `${path}.${field.key}`;
        const value = record[field.key];
        const required = field.required !== false;
        if (value === undefined) {
            if (required) {
                issues.push({ severity: "error", code: "field-missing", message: `${fieldPath} 缺少必填字段` });
            }
            continue;
        }
        issues.push(...validateField(field, value, i18n, fieldPath));
    }
    return issues;
}

function validateField(field: FieldSpec, value: unknown, i18n: I18nState | null, path: string): ContentIssue[] {
    const issues: ContentIssue[] = [];
    switch (field.type) {
        case "string":
            if (typeof value !== "string") issues.push({ severity: "error", code: "field-type", message: `${path} 应为字符串` });
            break;
        case "number":
            if (typeof value !== "number" || !Number.isFinite(value)) {
                issues.push({ severity: "error", code: "field-type", message: `${path} 应为数字` });
            } else {
                if (field.min !== undefined && value < field.min) issues.push({ severity: "error", code: "field-range", message: `${path} ${value} 低于下限 ${field.min}` });
                if (field.max !== undefined && value > field.max) issues.push({ severity: "error", code: "field-range", message: `${path} ${value} 超过上限 ${field.max}` });
            }
            break;
        case "boolean":
            if (typeof value !== "boolean") issues.push({ severity: "error", code: "field-type", message: `${path} 应为布尔值` });
            break;
        case "enum":
            if (typeof value !== "string" || field.enum === undefined || !field.enum.includes(value)) {
                issues.push({ severity: "error", code: "field-enum", message: `${path} 取值非法: "${String(value)}"（合法: ${field.enum?.join("/") ?? "无"}）` });
            }
            break;
        case "id":
            if (typeof value !== "string" || value.length === 0) issues.push({ severity: "error", code: "field-type", message: `${path} 应为非空字符串 id` });
            break;
        case "i18n-key":
            if (typeof value !== "string") {
                issues.push({ severity: "error", code: "field-type", message: `${path} 应为本地化 key 字符串` });
            } else if (!isI18nKeyFormat(value)) {
                issues.push({
                    severity: "error",
                    code: "embedded-text",
                    message: `${path} 内嵌可见文本（应引用本地化 key，如 auto_battle.<table>.<id>.name）: "${value}"`,
                });
            } else if (i18n !== null && !(value in i18n.main.entries)) {
                issues.push({ severity: "error", code: "i18n-key-unknown", message: `${path} 引用未声明的本地化 key: "${value}"` });
            }
            break;
        case "array":
            if (!Array.isArray(value)) {
                issues.push({ severity: "error", code: "field-type", message: `${path} 应为数组` });
            } else if (field.itemType === "enum" && field.itemEnum !== undefined) {
                for (const [i, item] of value.entries()) {
                    if (typeof item !== "string" || !field.itemEnum.includes(item)) {
                        issues.push({ severity: "error", code: "field-enum", message: `${path}[${i}] 取值非法: "${String(item)}"` });
                    }
                }
            }
            break;
        case "object":
            if (value === null || typeof value !== "object" || Array.isArray(value)) {
                issues.push({ severity: "error", code: "field-type", message: `${path} 应为对象` });
            }
            break;
    }
    return issues;
}

/** 跨表引用解析：字段声明 refTable 时，值必须存在于目标表 id 索引。 */
function validateCrossRefs(projectRoot: string, schemas: readonly TableSchema[], indexes: readonly TableIndex[], deps: ValidateDeps): ContentIssue[] {
    const issues: ContentIssue[] = [];
    const indexByTable = new Map(indexes.map((index) => [index.table, index]));
    for (const schema of schemas) {
        const file = join(projectRoot, schema.file);
        if (!deps.exists(file)) continue;
        let rows: unknown;
        try {
            rows = deps.readJson(file);
        } catch {
            continue;
        }
        const list = schema.shape === "array" ? (Array.isArray(rows) ? rows : []) : [];
        list.forEach((row, index) => {
            if (row === null || typeof row !== "object" || Array.isArray(row)) return;
            const record = row as Record<string, unknown>;
            for (const field of schema.fields) {
                if (field.refTable === undefined) continue;
                const value = record[field.key];
                if (typeof value !== "string" || value.length === 0) continue;
                const target = indexByTable.get(field.refTable);
                if (target === undefined) {
                    issues.push({ severity: "error", code: "ref-unknown-table", message: `${schema.file}[${index}].${field.key} 引用未知表 "${field.refTable}"` });
                } else if (!target.ids.has(value)) {
                    issues.push({
                        severity: "error",
                        code: "ref-dangling",
                        message: `${schema.file}[${index}].${field.key} 悬空引用: "${value}"（${field.refTable} 表不存在该 id）`,
                    });
                }
            }
        });
    }
    return issues;
}

export { ALL_SCHEMAS };
