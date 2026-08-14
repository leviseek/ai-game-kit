import type { IResourceKey } from "./IResourceKey";

/** 资源提供器的引擎接缝：loader/unloadBundle/unloadPackage 由具体引擎适配器注入。 */
export interface IResourceProviderOptions {
    /** 底层加载器：按资源键执行一次真实加载，失败时向协调器传递原因。 */
    readonly loader: (key: IResourceKey) => Promise<unknown>;
    /** 卸载执行器：Bundle 不再被任何作用域持有时调用，执行引擎级卸载。 */
    readonly unloadBundle: (bundle: string) => void;
    /**
     * 可选：FGUI package 不再被任何作用域持有（引用归零）时调用，即使其所在
     * Bundle 仍被其它包持有（如共享 bundle 中常驻的通用包）。执行引擎级包注册表
     * 移除；缺省不提供时包随 Bundle 卸载路径清理。
     */
    readonly unloadPackage?: (bundle: string, path: string) => void;
}
