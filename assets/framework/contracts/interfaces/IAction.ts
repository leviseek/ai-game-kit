/**
 * 动作基型：type 判别字段 + 载荷。禁止裸字符串 type 散落（常量表归口）。
 */
export interface IAction {
    readonly type: string;
}
