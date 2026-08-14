/**
 * 基础能力节点：所有类型化元件共享的显隐写入。
 * 引擎无关的能力接口族：把 FGUI 元件按能力 kind 包装为类型化节点，
 * 业务层只消费这些接口（不接触 fgui/cc 类型），实现由 Adapter 边界按 kind 分派。
 */
export interface ITypedNode {
    setVisible(visible: boolean): void;
}
