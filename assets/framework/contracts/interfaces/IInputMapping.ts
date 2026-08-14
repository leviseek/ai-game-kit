/**
 * 单个输入上下文下的映射声明：底层输入源 → action。
 * 键空间即普通字符串（branded 键无法作 Record 键，语义等价）。
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IInputMapping<TAction> extends Readonly<Record<string, TAction>> {}
