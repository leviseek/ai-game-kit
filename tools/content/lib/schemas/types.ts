/**
 * 配置表 schema 描述结构（手写描述式校验，对齐 lib/spec.ts；不用 zod——
 * .ai/instructions.md 第 3 条禁止第三方运行时依赖）。
 */

export type FieldType = "string" | "number" | "boolean" | "enum" | "id" | "i18n-key" | "array" | "object";

export interface FieldSpec {
    readonly key: string;
    readonly type: FieldType;
    /** 缺省 true（除显式 required:false）；i18n-key 与 id 类型默认必填 */
    readonly required?: boolean;
    /** number 类型：数值下限/上限（含） */
    readonly min?: number;
    readonly max?: number;
    /** enum 类型：合法取值 */
    readonly enum?: readonly string[];
    /** id 类型：标记为表内主键（数组表参与唯一性校验） */
    readonly idKey?: boolean;
    /** 跨表引用：目标表名（引用解析用目标表 id 索引） */
    readonly refTable?: string;
    /** array 类型：元素类型 */
    readonly itemType?: FieldType;
    /** array 元素为枚举时：合法取值 */
    readonly itemEnum?: readonly string[];
    /** object 类型：子结构（键为动态时留空，仅校验值类型宽松通过） */
    readonly fields?: readonly FieldSpec[];
    /** 用户可见文本语义说明（i18n-key 类型的文档语义） */
    readonly displayText?: boolean;
}

export interface TableSchema {
    /** 表名（跨表引用目标用；如 buffs/skills） */
    readonly table: string;
    /** 相对仓库根的 JSON 路径 */
    readonly file: string;
    /** 表形态：数组（条目列表）或对象（单配置） */
    readonly shape: "array" | "object";
    readonly fields: readonly FieldSpec[];
}

export interface ContentIssue {
    readonly severity: "error" | "warning";
    readonly code: string;
    readonly message: string;
    readonly path?: string;
}
