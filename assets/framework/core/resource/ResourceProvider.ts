import type { IResourceProvider } from "../../contracts/interfaces/IResourceProvider";
import type { IResourceProviderOptions } from "../../contracts/interfaces/IResourceProviderOptions";
import type { IResourceKey } from "../../contracts/interfaces/IResourceKey";
import { EnumResourceKind } from "../../contracts/enums/EnumResourceKind";
import { createLoadCoordinator } from "./LoadCoordinator";
import { createResourceScopeRegistry } from "./ResourceScope";

function key(kind: EnumResourceKind, bundle: string, path: string): IResourceKey {
    return { kind, bundle, path };
}

/**
 * 引擎无关的资源提供器实现：把加载协调器（loader 接缝）与资源作用域注册表
 * （unloadBundle 接缝）组装成面向业务的统一入口。引擎差异只体现在注入的
 * loader/unloadBundle 上，契约与组装逻辑不依赖任何引擎。
 */
export function createResourceProvider(options: IResourceProviderOptions): IResourceProvider {
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
            return coordinator.load<T>(key(EnumResourceKind.Asset, bundle, path));
        },

        loadPackage<T>(bundle: string, path: string) {
            return coordinator.load<T>(key(EnumResourceKind.FairyGuiPackage, bundle, path));
        },

        preload<T>(bundle: string, path: string) {
            // 与 load 同形发起加载；预加载的消费与释放语义由 5.x SceneFlow 定义
            return coordinator.load<T>(key(EnumResourceKind.Asset, bundle, path));
        },

        canUnload(bundle: string) {
            return registry.canUnload(bundle);
        },

        invalidate(bundle: string, path: string) {
            coordinator.invalidate(key(EnumResourceKind.Asset, bundle, path));
        },

        invalidatePackage(bundle: string, path: string) {
            coordinator.invalidate(key(EnumResourceKind.FairyGuiPackage, bundle, path));
        },

        dispose() {
            for (const scope of scopes) {
                scope.release();
            }
            scopes.clear();
        },
    };
}
