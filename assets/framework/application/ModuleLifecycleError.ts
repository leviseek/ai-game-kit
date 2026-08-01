import type { ModulePhase } from "../contracts/module/Module";

export class ModuleLifecycleError extends Error {
  readonly moduleId: string;
  readonly phase: ModulePhase;
  readonly cause: unknown;

  constructor(
    moduleId: string,
    phase: ModulePhase,
    cause: unknown
  ) {
    super(`Module lifecycle failed`);

    this.name = "ModuleLifecycleError";
    this.moduleId = moduleId;
    this.phase = phase;
    this.cause = cause;
  }
}
