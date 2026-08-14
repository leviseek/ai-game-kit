import type { EnumResourceKind } from "../enums/EnumResourceKind";

/**
 * 资源标识：类型 + 归属 Bundle + 路径。
 * 引擎无关，handle 是跨模块协作的公共载体：业务持有 handle 参与作用域计数，
 * 跨模块只依赖 handle 与标识，不直接传递引擎 Asset 类型。
 */
export interface IResourceKey {
    readonly kind: EnumResourceKind;
    readonly bundle: string;
    readonly path: string;
}
