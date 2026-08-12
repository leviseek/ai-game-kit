/**
 * 引擎无关的能力接口族：把 FGUI 元件按能力 kind 包装为类型化节点。
 * 业务层只消费这些接口（不接触 fgui/cc 类型），实现由 Adapter 边界按 kind 分派。
 * 与 gen-types 的 ElementKind（button/input/progress/text/list/component/image/...）一一对应。
 */

/** 基础能力节点：所有类型化元件共享的显隐写入。 */
export interface TypedNode {
    setVisible(visible: boolean): void;
}

/** 文本节点：读写文本与显隐。 */
export interface TypedTextNode extends TypedNode {
    setText(value: string): void;
    text(): string;
}

/** 按钮节点：文本能力 + 点击注册。 */
export interface TypedButtonNode extends TypedTextNode {
    onClick(handler: () => void): void;
}

/** 输入节点：文本能力 + 读取输入值（单向数据流下 action 构造时读）。 */
export interface TypedInputNode extends TypedTextNode {
    readText(): string;
}

/** 进度节点：归一化 0..1 进度写入（映射到引擎 value 0..100）。 */
export interface TypedProgressNode extends TypedNode {
    setProgress(value: number): void;
}

/**
 * 图片节点：仅显隐（无其它通用能力）。作为能力标记接口存在，
 * 运行时实现与 TypedComponentNode 相同（见 Adapter 分派），类型区分供静态检查。
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TypedImageNode extends TypedNode {
}

/** 组件节点：通用容器（显隐 + 可选点击），fallback 能力 kind。 */
export interface TypedComponentNode extends TypedNode {
    onClick?(handler: () => void): void;
}

/**
 * 列表节点：容器能力（MVP 仅显隐，随真实需求扩展）。
 * 作为能力标记接口存在，运行时实现同 TypedComponentNode。
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TypedListNode extends TypedNode {
}
