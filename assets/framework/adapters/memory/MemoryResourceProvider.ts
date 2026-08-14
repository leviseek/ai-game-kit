import { createResourceProvider } from "../../core/resource/ResourceProvider";
import type { IResourceProvider } from "../../contracts/interfaces/IResourceProvider";
import type { IResourceKey } from "../../contracts/interfaces/IResourceKey";

export interface MemoryResourceProviderOptions {
    /** 内存加载器；缺省返回资源键字面量。可注入受控 loader 用于测试。 */
    readonly loader?: (key: IResourceKey) => Promise<unknown>;
    /** 卸载执行器；缺省为无操作。 */
    readonly unloadBundle?: (bundle: string) => void;
    /** 包级卸载执行器；缺省为无操作（内存环境无引擎注册表）。 */
    readonly unloadPackage?: (bundle: string, path: string) => void;
    /** 加载协调器终态缓存上限；缺省不设上限。 */
    readonly maxCoordinatorEntries?: number;
}

/**
 * 内存资源适配器：用内存加载器与无操作卸载实现 IResourceProvider，
 * 供纯 TypeScript 测试与需要内存资源的场景使用，不依赖任何引擎。
 */
export function createMemoryResourceProvider(options: MemoryResourceProviderOptions = {}): IResourceProvider {
    return createResourceProvider({
        loader: options.loader ?? (async (key: IResourceKey) => ({ bundle: key.bundle, path: key.path })),
        unloadBundle: options.unloadBundle ?? (() => undefined),
        unloadPackage: options.unloadPackage,
        maxCoordinatorEntries: options.maxCoordinatorEntries,
    });
}
