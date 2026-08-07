import type { IResourceProvider, Module, ResourceScope } from "../framework";

/**
 * 资源作用域模块：组合根用注入的资源提供者创建品类级作用域（fixture.scope）。
 * 跨场景资源按 SceneFlow 内部作用域释放；本模块持有的品类作用域在 dispose 时
 * 释放，保证夹具释放后无资源泄漏。
 */
export function createRpgResourceModule(
  provider: IResourceProvider,
  scope: ResourceScope,
): Module {
  return {
    id: "rpg.resource",
    dependencies: [],
    start: () => {
      // 作用域由组合根创建并注入；此处仅确认资源提供者已就绪
      void provider.canUnload("rpg");
    },
    dispose: () => {
      scope.release();
    },
  };
}
