import type { ModulePhase } from "./Module";

export class ModuleLifecycleError extends Error {
  readonly moduleId: string;
  readonly phase: ModulePhase;
  readonly cause: unknown;

  constructor(moduleId: string, phase: ModulePhase, cause: unknown) {
    const causeMessage = cause instanceof Error ? `: ${cause.message}` : "";

    super(`Module "${moduleId}" failed during ${phase}${causeMessage}`);

    this.name = "ModuleLifecycleError";
    this.moduleId = moduleId;
    this.phase = phase;
    this.cause = cause;
  }
}
