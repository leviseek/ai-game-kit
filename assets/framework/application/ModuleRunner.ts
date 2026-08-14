import type { IApplicationContext } from "../contracts/interfaces/IApplicationContext";
import type { IModule } from "../contracts/interfaces/IModule";
import { EnumModulePhase } from "../contracts/enums/EnumModulePhase";
import { EnumModuleRuntimeState } from "../contracts/enums/EnumModuleRuntimeState";
import { FrameworkError } from "../core/errors/FrameworkError";
import { ModuleLifecycleError } from "./ModuleLifecycleError";

type CleanupPhase = EnumModulePhase.Stop | EnumModulePhase.Dispose;

class ModuleCleanupError extends FrameworkError {
    readonly errors: readonly ModuleLifecycleError[];

    constructor(errors: readonly ModuleLifecycleError[], cause: ModuleLifecycleError) {
        super("IModule cleanup failed", { cause });

        this.name = "ModuleCleanupError";
        this.errors = Object.freeze([...errors]);
    }
}

/**
 * 模块生命周期执行器：启动/恢复按依赖顺序正序，暂停/停止/销毁逆序
 * （后启动的模块先清理）。某阶段失败时按已进入的状态回滚对应模块；
 * 清理错误逐个收集并聚合为 ModuleCleanupError（失败隔离，不因单个模块失败
 * 中断其他模块的清理）。
 */
export class ModuleRunner {
    private readonly modules: readonly IModule[];
    private readonly context: IApplicationContext;
    private readonly states = new Map<string, EnumModuleRuntimeState>();

    constructor(modules: readonly IModule[], context: IApplicationContext) {
        this.modules = [...modules];
        this.context = context;

        for (const module of this.modules) {
            this.states.set(module.id, EnumModuleRuntimeState.Registered);
        }
    }

    getState(moduleId: string): EnumModuleRuntimeState | undefined {
        return this.states.get(moduleId);
    }

    async initialize(): Promise<void> {
        for (const module of this.modules) {
            if (this.getState(module.id) !== EnumModuleRuntimeState.Registered) {
                continue;
            }

            try {
                await this.invokePhase(module, EnumModulePhase.Initialize);
                this.states.set(module.id, EnumModuleRuntimeState.Initialized);
            } catch (error) {
                const primaryError = this.asLifecycleError(module, EnumModulePhase.Initialize, error);
                // 初始化失败只 dispose 已进入 initialized 的模块；尚未初始化的保持 registered。
                const cleanupErrors = await this.cleanup(EnumModulePhase.Dispose, (state) => state === EnumModuleRuntimeState.Initialized, EnumModuleRuntimeState.Disposed);

                this.throwLifecycleFailure(primaryError, cleanupErrors);
            }
        }
    }

    async start(): Promise<void> {
        for (const module of this.modules) {
            if (this.getState(module.id) !== EnumModuleRuntimeState.Initialized) {
                continue;
            }

            try {
                await this.invokePhase(module, EnumModulePhase.Start);
                this.states.set(module.id, EnumModuleRuntimeState.Started);
            } catch (error) {
                const primaryError = this.asLifecycleError(module, EnumModulePhase.Start, error);
                // 启动失败分两层回滚：先 stop 已 started 的模块，再 dispose 所有已注册的模块。
                const stopErrors = await this.cleanup(EnumModulePhase.Stop, (state) => state === EnumModuleRuntimeState.Started, EnumModuleRuntimeState.Stopped);
                const disposeErrors = await this.cleanup(
                    EnumModulePhase.Dispose,
                    (state) =>
                        state === EnumModuleRuntimeState.Initialized || state === EnumModuleRuntimeState.Started || state === EnumModuleRuntimeState.Paused || state === EnumModuleRuntimeState.Stopped,
                    EnumModuleRuntimeState.Disposed,
                );

                this.throwLifecycleFailure(primaryError, [...stopErrors, ...disposeErrors]);
            }
        }
    }

    async pause(): Promise<void> {
        // 逆序：后启动的模块先暂停。
        for (let index = this.modules.length - 1; index >= 0; index -= 1) {
            const module = this.modules[index];

            if (this.getState(module.id) !== EnumModuleRuntimeState.Started) {
                continue;
            }

            await this.invokePhase(module, EnumModulePhase.Pause);
            this.states.set(module.id, EnumModuleRuntimeState.Paused);
        }
    }

    async resume(): Promise<void> {
        // 正序：与启动顺序一致恢复。
        for (const module of this.modules) {
            if (this.getState(module.id) !== EnumModuleRuntimeState.Paused) {
                continue;
            }

            await this.invokePhase(module, EnumModulePhase.Resume);
            this.states.set(module.id, EnumModuleRuntimeState.Started);
        }
    }

    async stop(): Promise<void> {
        const errors = await this.cleanup(EnumModulePhase.Stop, (state) => state === EnumModuleRuntimeState.Started || state === EnumModuleRuntimeState.Paused, EnumModuleRuntimeState.Stopped);

        this.throwCleanupErrors(errors);
    }

    async dispose(): Promise<void> {
        const errors = await this.cleanup(
            EnumModulePhase.Dispose,
            (state) => state === EnumModuleRuntimeState.Initialized || state === EnumModuleRuntimeState.Started || state === EnumModuleRuntimeState.Paused || state === EnumModuleRuntimeState.Stopped,
            EnumModuleRuntimeState.Disposed,
        );

        this.throwCleanupErrors(errors);
    }

    private async invokePhase(module: IModule, phase: EnumModulePhase): Promise<void> {
        try {
            await module[phase]?.call(module, this.context);
        } catch (error) {
            const lifecycleError = new ModuleLifecycleError(module.id, phase, error);

            this.context.logger.error(
                "IModule lifecycle failed",
                {
                    moduleId: module.id,
                    phase,
                    result: "failure",
                },
                lifecycleError,
            );

            throw lifecycleError;
        }

        this.context.logger.info("IModule lifecycle completed", {
            moduleId: module.id,
            phase,
            result: "success",
        });
    }

    private async cleanup(phase: CleanupPhase, shouldRun: (state: EnumModuleRuntimeState | undefined) => boolean, completedState: EnumModuleRuntimeState): Promise<ModuleLifecycleError[]> {
        const errors: ModuleLifecycleError[] = [];
        // 通用清理：按谓词判定每个模块应从何状态清理到 completedState，避免硬编码状态集合。
        // 逆序遍历保证后启动的模块先清理。
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

    private asLifecycleError(module: IModule, phase: EnumModulePhase, error: unknown): ModuleLifecycleError {
        return error instanceof ModuleLifecycleError ? error : new ModuleLifecycleError(module.id, phase, error);
    }

    private throwLifecycleFailure(primaryError: ModuleLifecycleError, cleanupErrors: readonly ModuleLifecycleError[]): never {
        if (cleanupErrors.length > 0) {
            throw new ModuleCleanupError(cleanupErrors, primaryError);
        }

        throw primaryError;
    }

    private throwCleanupErrors(errors: readonly ModuleLifecycleError[]): void {
        if (errors.length > 0) {
            throw new ModuleCleanupError(errors, errors[0]);
        }
    }
}
