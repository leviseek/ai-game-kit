import {
  Application,
  type ApplicationContext,
  type Logger,
  type Module,
  type ResourceScope,
} from "../../framework";

/**
 * 品类组合夹具公共契约：声明该品类需要的模块装配清单（modules）与资源作用域
 * （scope），并提供统一生命周期接缝。五类夹具与 8.6 统一测试共用此接口，
 * 组合清单保持显式、不引入框架之外的自动扫描机制（对齐 design decision 2）。
 */
export interface GameFixture {
  /** 品类标识（如 "rpg"、"card"）。 */
  readonly id: string;
  /** 该品类模块装配清单：只包含已声明的模块，未声明的能力不参与装配。 */
  readonly modules: readonly Module[];
  /** 该品类声明的资源作用域；未声明资源能力时缺省不持有作用域。 */
  readonly scope?: ResourceScope;
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  failRollback(): Promise<void>;
  dispose(): Promise<void>;
}

export interface GameFixtureOptions {
  readonly id: string;
  readonly modules: readonly Module[];
  readonly scope?: ResourceScope;
  /** 可选日志：缺省为静默日志，保持夹具装配过程无输出。 */
  readonly logger?: Logger;
}

// 失败回滚验证用的哨兵模块：start 阶段抛错，用于触发框架的启动失败回滚路径。
const failingProbeModule: Module = {
  id: "__fixture_fail_probe__",
  dependencies: [],
  start: () => {
    throw new Error("fixture failRollback: forced startup failure");
  },
};

function createQuietLogger(): Logger {
  const logger: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child: () => logger,
  };
  return logger;
}

// 与框架 createApplicationContext 一致：context.state 始终为 "created"，
// 应用自身的状态由 Application 内部维护，不写入 context。
function createFixtureContext(logger: Logger): ApplicationContext {
  return {
    logger,
    get state() {
      return "created" as const;
    },
  };
}

/**
 * 失败回滚接缝：用一个一次性探针 Application（本夹具模块 + 哨兵失败模块）
 * 驱动一次注定失败的启动，验证已启动模块按逆序回滚、应用进入 disposed 终态。
 * 探针复用同一批模块实例（启动/回滚钩子会再次执行），对轻量夹具可接受；
 * 本接缝只证明组合可回滚，不改变夹具自身 app 的当前状态。
 */
async function runFailRollbackProbe(
  modules: readonly Module[],
  context: ApplicationContext,
): Promise<void> {
  const probe = new Application([...modules, failingProbeModule], context);
  let rejected = false;

  try {
    await probe.start();
  } catch {
    rejected = true;
  }

  if (!rejected || probe.state !== "disposed") {
    throw new Error(
      "fixture failRollback: startup failure did not roll back to disposed",
    );
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
