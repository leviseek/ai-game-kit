import type { ApplicationContext } from "../contracts/application/ApplicationContext";
import type {
  Module,
  ModuleRuntimeState,
} from "../contracts/module/Module";

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

      await module.initialize?.(this.context);
      this.states.set(module.id, "initialized");
    }
  }

  async start(): Promise<void> {
    for (const module of this.modules) {
      if (this.getState(module.id) !== "initialized") {
        continue;
      }

      await module.start?.(this.context);
      this.states.set(module.id, "started");
    }
  }

  async pause(): Promise<void> {
    for (const module of [...this.modules].reverse()) {
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
    for (const module of [...this.modules].reverse()) {
      if (this.getState(module.id) !== "started") {
        continue;
      }

      await module.stop?.(this.context);
      this.states.set(module.id, "stopped");
    }
  }

  async dispose(): Promise<void> {
    for (const module of [...this.modules].reverse()) {
      const state = this.getState(module.id);

      if (state !== "initialized" && state !== "stopped") {
        continue;
      }

      await module.dispose?.(this.context);
      this.states.set(module.id, "disposed");
    }
  }
}
