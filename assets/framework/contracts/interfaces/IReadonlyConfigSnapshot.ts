/**
 * 只读配置快照：配置装载后暴露给读取方的不可变结构（深度冻结）。
 * 键空间即普通字符串（branded 键无法作 Record 键，语义等价）。
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IReadonlyConfigSnapshot extends Readonly<Record<string, unknown>> {}
