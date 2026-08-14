import type { ILogger } from "./ILogger";
import type { IApplicationLifecycle } from "./IApplicationLifecycle";

/**
 * 应用生命周期与模块可感知上下文的契约。IApplicationContext 由组合根在创建时
 * 提供给模块的 phase 方法，只读地暴露 Logger 与生命周期状态。
 */
export interface IApplicationContext extends IApplicationLifecycle {
    readonly logger: ILogger;
}
