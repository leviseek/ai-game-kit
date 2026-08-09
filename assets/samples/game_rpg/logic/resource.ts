import type { IResourceProvider, Module, ResourceScope } from "../../../framework";

/**
 * 资源作用域模块：组合根用注入的资源提供者创建品类级作用域（fixture.scope）。
 * 跨场景资源按 SceneFlow 内部作用域释放。模块只声明装配关系，不在此释放
 * 共享作用域——组合根的 dispose 统一释放（避免 failRollback 探针复用模块
 * 实例时提前释放夹具自身作用域，对齐 GameFixture 幂等契约）。
 */
export function createRpgResourceModule(
    provider: IResourceProvider,
    _scope: ResourceScope,
): Module {
    return {
        id: "rpg.resource",
        dependencies: [],
        start: () => {
            // 作用域由组合根创建并注入；此处仅确认资源提供者已就绪
            void provider.canUnload("rpg");
        },
    };
}
