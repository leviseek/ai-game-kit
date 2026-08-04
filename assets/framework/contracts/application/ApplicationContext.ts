import type { Logger } from "../logging/Logger";

// 应用状态机推进方向：created -> initializing -> running <-> paused -> stopping -> disposed。
export type ApplicationState =
  | "created"
  | "initializing"
  | "running"
  | "paused"
  | "stopping"
  | "disposed";

export interface ApplicationLifecycle {
  readonly state: ApplicationState;
}

/**
 * 应用生命周期与模块可感知上下文的契约。ApplicationContext 由组合根在创建时
 * 提供给模块的 phase 方法，只读地暴露 Logger 与生命周期状态。
 */
export interface ApplicationContext extends ApplicationLifecycle {
  readonly logger: Logger;
}
