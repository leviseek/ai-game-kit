/** 结构化日志上下文：任意键值对，只读记录。 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ILogContext extends Readonly<Record<string, unknown>> {}
