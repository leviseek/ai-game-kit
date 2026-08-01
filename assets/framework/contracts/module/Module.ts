import type { ApplicationContext } from "../application/ApplicationContext";

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
