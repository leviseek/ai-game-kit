import type { IResourceProvider, Module, ResourceScope } from "../../../framework";

/**
 * 资源作用域模块：组合根用注入的资源提供者创建品类级作用域（fixture.scope）。
 * 战斗资源（命中特效等）经作用域持有，dispose 时统一释放。模块只声明装配关系，
 * 不在此释放共享作用域——组合根的 dispose 统一负责（避免 failRollback 探针
 * 复用模块实例时提前释放夹具自身作用域，对齐 GameFixture 幂等契约）。
 */
export function createFightResourceModule(
    provider: IResourceProvider,
    _scope: ResourceScope,
): Module {
    return {
        id: "fight.resource",
        dependencies: [],
        start: () => {
            // 作用域由组合根创建并注入；此处仅确认资源提供者已就绪
            void provider.canUnload("samples");
        },
    };
}
