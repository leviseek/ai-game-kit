import { createResourceProvider } from "../../core/resource/ResourceProvider";
import type { IResourceProvider } from "../../contracts/resource/ResourceProvider";
import type { ResourceKey } from "../../contracts/resource/Resource";

export interface MemoryResourceProviderOptions {
  /** 内存加载器；缺省返回资源键字面量。可注入受控 loader 用于测试。 */
  readonly loader?: (key: ResourceKey) => Promise<unknown>;
  /** 卸载执行器；缺省为无操作。 */
  readonly unloadBundle?: (bundle: string) => void;
}

/**
 * 内存资源适配器：用内存加载器与无操作卸载实现 IResourceProvider，
 * 供纯 TypeScript 测试与需要内存资源的场景使用，不依赖任何引擎。
 */
export function createMemoryResourceProvider(
  options: MemoryResourceProviderOptions = {},
): IResourceProvider {
  return createResourceProvider({
    loader:
      options.loader ??
      (async (key: ResourceKey) => ({ bundle: key.bundle, path: key.path })),
    unloadBundle: options.unloadBundle ?? (() => undefined),
  });
}
