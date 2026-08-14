import { Application } from "./Application";
import { createApplicationContext } from "./ApplicationContext";
import type { IApplicationContext } from "../contracts/interfaces/IApplicationContext";
import type { ILogger } from "../contracts/interfaces/ILogger";
import type { IModule } from "../contracts/interfaces/IModule";
import type { IResourceScope } from "../contracts/interfaces/IResourceScope";

/**
 * 品类组合夹具公共契约：声明该品类需要的模块装配清单（modules）与资源作用域
 * （scope），并提供统一生命周期接缝。五类夹具与 8.6 统一测试共用此接口，
 * 组合清单保持显式、不引入框架之外的自动扫描机制（对齐 design decision 2）。
 *
 * 幂等约束：夹具模块的生命周期钩子（initialize/start/pause/resume/stop/dispose）
 * MUST 可重复执行——`failRollback` 的探针会复用同一批模块实例再次驱动一次
 * 注定失败的启动并回滚，钩子不得依赖"单次执行"假设（如创建后必须成对释放的
 * 资源、全局注册等）。轻量、无状态模块天然满足该约束。
 *
 * 装配约定：模块如何获得 scope / 服务等依赖，由品类 assembly 经构造闭包注入
 * 到模块内部，契约不规定注入方式（IApplicationContext 只暴露 logger 与只读
 * 生命周期状态）。各品类夹具在 assembly 中自行组织"哪些模块拿到哪个 scope"，
 * 避免发明共享的全局注入机制。
 */
export interface GameFixture {
    /** 品类标识（如 "rpg"、"card"）。 */
    readonly id: string;
    /** 该品类模块装配清单：只包含已声明的模块，未声明的能力不参与装配。 */
    readonly modules: readonly IModule[];
    /** 该品类声明的资源作用域；未声明资源能力时缺省不持有作用域。 */
    readonly scope?: IResourceScope;
    start(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    failRollback(): Promise<void>;
    dispose(): Promise<void>;
}

export interface GameFixtureOptions {
    readonly id: string;
    readonly modules: readonly IModule[];
    readonly scope?: IResourceScope;
    /** 可选日志：缺省为静默日志，保持夹具装配过程无输出。 */
    readonly logger?: ILogger;
}

// 失败回滚验证用的哨兵模块：start 阶段抛错，用于触发框架的启动失败回滚路径。
const failingProbeModule: IModule = {
    id: "__fixture_fail_probe__",
    dependencies: [],
    start: () => {
        throw new Error("fixture failRollback: forced startup failure");
    },
};

function createQuietLogger(): ILogger {
    const logger: ILogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        child: () => logger,
    };
    return logger;
}

// 夹具上下文复用框架 createApplicationContext：context.state 随探针/夹具自身
// Application 的状态转移真实更新（P1-2 修复后不再硬编码 created）。
function createFixtureContext(logger: ILogger): IApplicationContext {
    return createApplicationContext(logger);
}

/**
 * 失败回滚接缝：用一个一次性探针 Application（本夹具模块 + 哨兵失败模块）
 * 驱动一次注定失败的启动，验证已启动模块按逆序回滚、应用进入 disposed 终态。
 * 探针复用同一批模块实例（钩子会再次执行，故契约要求幂等），且使用独立的
 * Application 实例与独立探针状态机——不改变夹具自身 app 的当前状态。
 * 本接缝只证明组合可回滚；真实品类模块的失败注入由各品类自身测试承担。
 */
async function runFailRollbackProbe(modules: readonly IModule[], context: IApplicationContext): Promise<void> {
    const probe = new Application([...modules, failingProbeModule], context);
    let rejected = false;

    try {
        await probe.start();
    } catch {
        rejected = true;
    }

    if (!rejected || probe.state !== "disposed") {
        throw new Error("fixture failRollback: startup failure did not roll back to disposed");
    }
}

/**
 * 最小装配基础设施：按显式模块清单构造引擎无关的组合夹具。
 * 生命周期接缝委托给框架 Application；failRollback 经探针验证回滚路径。
 */
export function createGameFixture(options: GameFixtureOptions): GameFixture {
    const logger = options.logger ?? createQuietLogger();
    const context = createFixtureContext(logger);
    const app = new Application(options.modules, context);

    return {
        id: options.id,
        modules: [...options.modules],
        scope: options.scope,
        start: () => app.start(),
        pause: () => app.pause(),
        resume: () => app.resume(),
        failRollback: () => runFailRollbackProbe(options.modules, context),
        dispose: () => app.dispose(),
    };
}
