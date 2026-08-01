import type { ModulePhase } from "../contracts/module/Module";

type ErrorConstructorWithCause = new (
  message?: string,
  options?: { readonly cause?: unknown },
) => Error;

const ErrorWithCause = Error as ErrorConstructorWithCause;

export class ModuleLifecycleError extends ErrorWithCause {
  readonly moduleId: string;
  readonly phase: ModulePhase;

  constructor(
    moduleId: string,
    phase: ModulePhase,
    cause: unknown,
  ) {
    super("Module lifecycle failed", { cause });

    this.name = "ModuleLifecycleError";
    this.moduleId = moduleId;
    this.phase = phase;
  }
}
