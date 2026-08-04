import type { ApplicationContext } from "../application/ApplicationContext";

// phase 推进方向：initialize -> start -> pause/resume -> stop -> dispose（启动正序、清理逆序）。
export type ModulePhase =
  | "initialize"
  | "start"
  | "pause"
  | "resume"
  | "stop"
  | "dispose";

export type ModuleRuntimeState =
  | "registered"
  | "initialized"
  | "started"
  | "paused"
  | "stopped"
  | "disposed";

/**
 * 模块契约：业务模块只依赖本接口与 ApplicationContext，phase 方法可选、
 * 由框架按序调用。实现不应依赖 Cocos 或应用层具体类型。
 */
export interface Module {
  readonly id: string;
  readonly dependencies: readonly string[];

  initialize?(context: ApplicationContext): void | Promise<void>;
  start?(context: ApplicationContext): void | Promise<void>;
  pause?(context: ApplicationContext): void | Promise<void>;
  resume?(context: ApplicationContext): void | Promise<void>;
  stop?(context: ApplicationContext): void | Promise<void>;
  dispose?(context: ApplicationContext): void | Promise<void>;
}
