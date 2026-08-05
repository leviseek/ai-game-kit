import type {
  IResourceProvider,
  ResourceProviderOptions,
} from "../../contracts/resource/ResourceProvider";
import type { ResourceKey } from "../../contracts/resource/Resource";
import { createLoadCoordinator } from "./LoadCoordinator";
import { createResourceScopeRegistry } from "./ResourceScope";

function assetKey(bundle: string, path: string): ResourceKey {
  // 本阶段业务只加载 asset，kind 由 Provider 内部固定；FairyGUI 维度不进入公共 API
  return { kind: "asset", bundle, path };
}

/**
 * 引擎无关的资源提供器实现：把加载协调器（loader 接缝）与资源作用域注册表
 * （unloadBundle 接缝）组装成面向业务的统一入口。引擎差异只体现在注入的
 * loader/unloadBundle 上，契约与组装逻辑不依赖任何引擎。
 */
export function createResourceProvider(
  options: ResourceProviderOptions,
): IResourceProvider {
  const coordinator = createLoadCoordinator({ loader: options.loader });
  const registry = createResourceScopeRegistry({
    unloadBundle: options.unloadBundle,
  });
  const scopes = new Set<ReturnType<typeof registry.createScope>>();

  return {
    createScope() {
      const scope = registry.createScope();
      scopes.add(scope);
      return scope;
    },

    load<T>(bundle: string, path: string) {
      return coordinator.load<T>(assetKey(bundle, path));
    },

    preload<T>(bundle: string, path: string) {
      // 与 load 同形发起加载；预加载的消费与释放语义由 5.x SceneFlow 定义
      return coordinator.load<T>(assetKey(bundle, path));
    },

    canUnload(bundle: string) {
      return registry.canUnload(bundle);
    },

    dispose() {
      for (const scope of scopes) {
        scope.release();
      }
      scopes.clear();
    },
  };
}
