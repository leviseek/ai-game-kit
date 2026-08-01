import type { ApplicationContext } from "../contracts/application/ApplicationContext";
import type {
  Module,
  ModulePhase,
  ModuleRuntimeState,
} from "../contracts/module/Module";
import { ModuleLifecycleError } from "./ModuleLifecycleError";

type ErrorConstructorWithCause = new (
  message?: string,
  options?: { readonly cause?: unknown },
) => Error;

type CleanupPhase = "stop" | "dispose";

const ErrorWithCause = Error as ErrorConstructorWithCause;

class ModuleCleanupError extends ErrorWithCause {
  readonly errors: readonly ModuleLifecycleError[];

  constructor(
    errors: readonly ModuleLifecycleError[],
    cause: ModuleLifecycleError,
  ) {
    super("Module cleanup failed", { cause });

    this.name = "ModuleCleanupError";
    this.errors = Object.freeze([...errors]);
  }
}

export class ModuleRunner {
  private readonly modules: readonly Module[];
  private readonly context: ApplicationContext;
  private readonly states = new Map<string, ModuleRuntimeState>();

  constructor(
    modules: readonly Module[],
    context: ApplicationContext,
  ) {
    this.modules = [...modules];
    this.context = context;

    for (const module of this.modules) {
      this.states.set(module.id, "registered");
    }
  }

  getState(moduleId: string): ModuleRuntimeState | undefined {
    return this.states.get(moduleId);
  }

  async initialize(): Promise<void> {
    for (const module of this.modules) {
      if (this.getState(module.id) !== "registered") {
        continue;
      }

      try {
        await this.invokePhase(module, "initialize");
        this.states.set(module.id, "initialized");
      } catch (error) {
        const primaryError = this.asLifecycleError(
          module,
          "initialize",
          error,
        );
        const cleanupErrors = await this.cleanup(
          "dispose",
          (state) => state === "initialized",
          "disposed",
        );

        this.throwLifecycleFailure(primaryError, cleanupErrors);
      }
    }
  }

  async start(): Promise<void> {
    for (const module of this.modules) {
      if (this.getState(module.id) !== "initialized") {
        continue;
      }

      try {
        await this.invokePhase(module, "start");
        this.states.set(module.id, "started");
      } catch (error) {
        const primaryError = this.asLifecycleError(module, "start", error);
        const stopErrors = await this.cleanup(
          "stop",
          (state) => state === "started",
          "stopped",
        );
        const disposeErrors = await this.cleanup(
          "dispose",
          (state) =>
            state === "initialized" ||
            state === "started" ||
            state === "paused" ||
            state === "stopped",
          "disposed",
        );

        this.throwLifecycleFailure(
          primaryError,
          [...stopErrors, ...disposeErrors],
        );
      }
    }
  }

  async pause(): Promise<void> {
    for (let index = this.modules.length - 1; index >= 0; index -= 1) {
      const module = this.modules[index];

      if (this.getState(module.id) !== "started") {
        continue;
      }

      await module.pause?.(this.context);
      this.states.set(module.id, "paused");
    }
  }

  async resume(): Promise<void> {
    for (const module of this.modules) {
      if (this.getState(module.id) !== "paused") {
        continue;
      }

      await module.resume?.(this.context);
      this.states.set(module.id, "started");
    }
  }

  async stop(): Promise<void> {
    const errors = await this.cleanup(
      "stop",
      (state) => state === "started" || state === "paused",
      "stopped",
    );

    this.throwCleanupErrors(errors);
  }

  async dispose(): Promise<void> {
    const errors = await this.cleanup(
      "dispose",
      (state) =>
        state === "initialized" ||
        state === "started" ||
        state === "paused" ||
        state === "stopped",
      "disposed",
    );

    this.throwCleanupErrors(errors);
  }

  private async invokePhase(
    module: Module,
    phase: ModulePhase,
  ): Promise<void> {
    try {
      await module[phase]?.call(module, this.context);
    } catch (error) {
      throw new ModuleLifecycleError(module.id, phase, error);
    }
  }

  private async cleanup(
    phase: CleanupPhase,
    shouldRun: (state: ModuleRuntimeState | undefined) => boolean,
    completedState: ModuleRuntimeState,
  ): Promise<ModuleLifecycleError[]> {
    const errors: ModuleLifecycleError[] = [];

    for (let index = this.modules.length - 1; index >= 0; index -= 1) {
      const module = this.modules[index];

      if (!shouldRun(this.getState(module.id))) {
        continue;
      }

      try {
        await this.invokePhase(module, phase);
        this.states.set(module.id, completedState);
      } catch (error) {
        errors.push(this.asLifecycleError(module, phase, error));
      }
    }

    return errors;
  }

  private asLifecycleError(
    module: Module,
    phase: ModulePhase,
    error: unknown,
  ): ModuleLifecycleError {
    return error instanceof ModuleLifecycleError
      ? error
      : new ModuleLifecycleError(module.id, phase, error);
  }

  private throwLifecycleFailure(
    primaryError: ModuleLifecycleError,
    cleanupErrors: readonly ModuleLifecycleError[],
  ): never {
    if (cleanupErrors.length > 0) {
      throw new ModuleCleanupError(cleanupErrors, primaryError);
    }

    throw primaryError;
  }

  private throwCleanupErrors(
    errors: readonly ModuleLifecycleError[],
  ): void {
    if (errors.length > 0) {
      throw new ModuleCleanupError(errors, errors[0]);
    }
  }
}
