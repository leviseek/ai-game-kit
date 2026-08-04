import type { ModulePhase } from "../contracts/module/Module";
import { FrameworkError } from "../core/errors/FrameworkError";

export class ModuleLifecycleError extends FrameworkError {
  declare readonly moduleId: string;
  declare readonly phase: ModulePhase;

  constructor(
    moduleId: string,
    phase: ModulePhase,
    cause: unknown,
  ) {
    super("Module lifecycle failed", {
      cause,
      moduleId,
      phase,
    });

    this.name = "ModuleLifecycleError";
  }
}
