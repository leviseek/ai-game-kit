import type {
    ApplicationContext,
    ApplicationState,
} from "../contracts/application/ApplicationContext";
import type { Module } from "../contracts/module/Module";
import { ApplicationStateError } from "./ApplicationStateError";
import { ModuleGraph } from "./ModuleGraph";
import { ModuleRunner } from "./ModuleRunner";

/**
 * 应用生命周期编排器。状态机路径为 created -> initializing -> running
 * <-> paused -> stopping -> disposed。所有公开操作经串行队列（enqueue）执行，
 * 避免并发操作竞争状态；start/dispose 另有 inFlight 防重入，保证重复调用
 * 返回同一进行中的操作。
 */
export class Application {
    private readonly modules: readonly Module[];
    private readonly context: ApplicationContext;
    private runner: ModuleRunner | undefined;
    private currentState: ApplicationState = "created";
    private queueTail: Promise<void> = Promise.resolve();
    // start/dispose 用 inFlight 防重入（幂等返回同一操作）；pause/resume 只靠状态守卫，
    // 因为它们在目标状态时本身就是幂等操作。
    private inFlightStart: Promise<void> | null = null;
    private inFlightDispose: Promise<void> | null = null;

    constructor(modules: readonly Module[], context: ApplicationContext) {
        this.modules = [...modules];
        this.context = context;
    }

    get state(): ApplicationState {
        return this.currentState;
    }

    start(): Promise<void> {
        if (this.inFlightStart !== null) {
            return this.inFlightStart;
        }

        if (this.currentState !== "created") {
            return Promise.reject(new ApplicationStateError(this.currentState));
        }

        const operation = this.enqueue(async () => {
            this.setState("initializing");

            let runner: ModuleRunner | undefined;

            try {
                const orderedModules = new ModuleGraph(this.modules).orderedModules;

                runner = new ModuleRunner(orderedModules, this.context);
                this.runner = runner;
                await runner.initialize();
                await runner.start();
            } catch (primaryError) {
                // 启动失败后直接进入 disposed 终态：应用不可重试，必须重新创建实例。
                this.setState("stopping");
                await this.rollback(runner);
                this.setState("disposed");
                throw primaryError;
            }

            this.setState("running");
        });

        this.inFlightStart = operation;

        operation.then(
            () => { if (this.inFlightStart === operation) this.inFlightStart = null; },
            () => { if (this.inFlightStart === operation) this.inFlightStart = null; },
        );

        return operation;
    }

    pause(): Promise<void> {
        if (this.currentState === "paused") {
            return Promise.resolve();
        }

        if (this.currentState !== "running") {
            return Promise.reject(new ApplicationStateError(this.currentState));
        }

        return this.enqueue(async () => {
            await this.runner?.pause();
            this.setState("paused");
        });
    }

    resume(): Promise<void> {
        if (this.currentState === "running") {
            return Promise.resolve();
        }

        if (this.currentState !== "paused") {
            return Promise.reject(new ApplicationStateError(this.currentState));
        }

        return this.enqueue(async () => {
            await this.runner?.resume();
            this.setState("running");
        });
    }

    dispose(): Promise<void> {
        if (this.currentState === "disposed") {
            return Promise.resolve();
        }

        if (this.inFlightDispose !== null) {
            return this.inFlightDispose;
        }

        const operation = this.enqueue(async () => {
            this.setState("stopping");

            const cleanupErrors: unknown[] = [];

            try { await this.runner?.stop(); } catch (e) { cleanupErrors.push(e); }
            try { await this.runner?.dispose(); } catch (e) { cleanupErrors.push(e); }

            this.setState("disposed");

            if (cleanupErrors.length > 0) {
                this.reportCleanupErrors("dispose", cleanupErrors);
                throw cleanupErrors[0];
            }
        });

        this.inFlightDispose = operation;

        operation.then(
            () => { if (this.inFlightDispose === operation) this.inFlightDispose = null; },
            () => { if (this.inFlightDispose === operation) this.inFlightDispose = null; },
        );

        return operation;
    }

    /**
     * 启动失败回滚：只停止并释放已进入后续状态的模块。与 dispose() 不同，
     * 回滚中的清理错误只记录（主错误已抛出，不能再掩盖它）；dispose() 则抛出第一个清理错误。
     */
    private async rollback(runner: ModuleRunner | undefined): Promise<void> {
        const cleanupErrors: unknown[] = [];

        try { await runner?.stop(); } catch (e) { cleanupErrors.push(e); }
        try { await runner?.dispose(); } catch (e) { cleanupErrors.push(e); }

        if (cleanupErrors.length > 0) {
            this.reportCleanupErrors("start rollback", cleanupErrors);
        }
    }

    private reportCleanupErrors(
        phase: string,
        errors: readonly unknown[],
    ): void {
        for (const error of errors) {
            this.context.logger.error(
                "Module cleanup failed",
                { phase, errorCount: errors.length },
                error instanceof Error ? error : undefined,
            );
        }
    }

    private setState(next: ApplicationState): void {
        this.currentState = next;
    }

    private enqueue(task: () => Promise<void>): Promise<void> {
        // then(task, task) 让后续任务在前序失败后仍继续执行（失败不中断队列）。
        const next = this.queueTail.then(task, task);
        this.queueTail = next;
        return next;
    }
}
