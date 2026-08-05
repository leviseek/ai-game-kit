import type { ResourceHandle, ResourceKey } from "./Resource";
import type { ResourceScope } from "./ResourceScope";

/** 资源提供器的引擎接缝：loader 与 unloadBundle 由具体引擎适配器注入。 */
export interface ResourceProviderOptions {
  /** 底层加载器：按资源键执行一次真实加载，失败时向协调器传递原因。 */
  readonly loader: (key: ResourceKey) => Promise<unknown>;
  /** 卸载执行器：Bundle 不再被任何作用域持有时调用，执行引擎级卸载。 */
  readonly unloadBundle: (bundle: string) => void;
}

/**
 * 业务访问资源的唯一入口。业务代码只能通过本契约加载/释放资源，不得直接
 * 调用引擎 Bundle 加载/释放 API；引擎交互由具体适配器在内部完成。
 */
export interface IResourceProvider {
  /** 创建持有资源的独立作用域。作用域由 Provider 产生，业务不直接实例化。 */
  createScope(): ResourceScope;

  /**
   * 加载单个资源并同步返回 handle。同一资源的并发请求共享一次底层加载；
   * handle 可参与作用域计数，加载失败保留 cause 与资源标识。
   */
  load<T = unknown>(bundle: string, path: string): ResourceHandle<T>;

  /**
   * 预加载：与 load 同形，发起加载并返回 handle。预加载的消费与释放语义
   * 由后续 SceneFlow 阶段定义，本契约只锁定其存在性与签名。
   */
  preload<T = unknown>(bundle: string, path: string): ResourceHandle<T>;

  /**
   * 查询某 Bundle 当前是否已无任何作用域持有（可卸载）。
   * true 仅表示无框架侧持有，引擎侧卸载是否已完成需以具体适配器的观察为准
   * （如 Cocos 适配器下 `assetManager.getBundle(name) === null`）。
   */
  canUnload(bundle: string): boolean;

  /**
   * 使某资源的终态缓存（ready/failed）失效，下次 load/preload 触发新的底层加载。
   * 用于场景重试或卸载后同 key 重载需要新资源实例的场景。
   */
  invalidate(bundle: string, path: string): void;

  /** 释放本 Provider 创建的全部作用域。不使 Provider 失效，也不清除底层缓存终态。 */
  dispose(): void;
}
