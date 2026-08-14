import type { IResourceKey } from "./IResourceKey";

/** 资源提供器的引擎接缝：loader 与 unloadBundle 由具体引擎适配器注入。 */
export interface IResourceProviderOptions {
    /** 底层加载器：按资源键执行一次真实加载，失败时向协调器传递原因。 */
    readonly loader: (key: IResourceKey) => Promise<unknown>;
    /** 卸载执行器：Bundle 不再被任何作用域持有时调用，执行引擎级卸载。 */
    readonly unloadBundle: (bundle: string) => void;
}
