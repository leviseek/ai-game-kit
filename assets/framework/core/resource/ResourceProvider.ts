import type { IResourceProvider, ResourceProviderOptions } from "../../contracts/resource/ResourceProvider";
import type { ResourceKey, ResourceKind } from "../../contracts/resource/Resource";
import { createLoadCoordinator } from "./LoadCoordinator";
import { createResourceScopeRegistry } from "./ResourceScope";

function key(kind: ResourceKind, bundle: string, path: string): ResourceKey {
    return { kind, bundle, path };
}

/**
 * 引擎无关的资源提供器实现：把加载协调器（loader 接缝）与资源作用域注册表
 * （unloadBundle 接缝）组装成面向业务的统一入口。引擎差异只体现在注入的
 * loader/unloadBundle 上，契约与组装逻辑不依赖任何引擎。
 */
export function createResourceProvider(options: ResourceProviderOptions): IResourceProvider {
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
            return coordinator.load<T>(key("asset", bundle, path));
        },

        loadPackage<T>(bundle: string, path: string) {
            return coordinator.load<T>(key("fairygui-package", bundle, path));
        },

        preload<T>(bundle: string, path: string) {
            // 与 load 同形发起加载；预加载的消费与释放语义由 5.x SceneFlow 定义
            return coordinator.load<T>(key("asset", bundle, path));
        },

        canUnload(bundle: string) {
            return registry.canUnload(bundle);
        },

        invalidate(bundle: string, path: string) {
            coordinator.invalidate(key("asset", bundle, path));
        },

        invalidatePackage(bundle: string, path: string) {
            coordinator.invalidate(key("fairygui-package", bundle, path));
        },

        dispose() {
            for (const scope of scopes) {
                scope.release();
            }
            scopes.clear();
        },
    };
}
