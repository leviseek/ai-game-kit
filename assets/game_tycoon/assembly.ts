import type {
  Module,
  PlatformStorage,
  UiNavigator,
} from "../framework";
import { createUiNavigator } from "../framework";
import {
  createGameFixture,
  type GameFixture,
} from "../game/fixture/GameFixture";
import {
  createTycoonClock,
  createTycoonClockModule,
  type TycoonClock,
} from "./clock";
import {
  createTycoonConfig,
  createTycoonConfigModule,
  type TycoonConfigHandle,
} from "./config";
import {
  createTycoonEconomy,
  createTycoonEconomyModule,
  type TycoonEconomyHandle,
} from "./production";
import {
  createTycoonProduction,
  createTycoonProductionModule,
  type TycoonProductionHandle,
} from "./production";
import {
  createTycoonSave,
  createTycoonSaveModule,
  type TycoonSave,
} from "./save";
import {
  createTycoonScheduler,
  createTycoonSchedulerModule,
  type TycoonScheduler,
} from "./scheduler";
import { createTycoonUiModule } from "./ui";

/** 生产 tick 间隔：调度器每次 tick 结算一次生产推进的固定节拍。 */
export const PRODUCTION_TICK_MS = 1000;

/** 缺省经营配置：产品数值与初始现金在夹具层内建，测试可注入覆盖。 */
const DEFAULT_TYCOON_CONFIG_CONTENT: Record<string, unknown> = {
  startCash: 100,
  products: [
    { id: "widget", name: "Widget", cost: 5, price: 10, durationMs: 1000 },
    { id: "gadget", name: "Gadget", cost: 8, price: 20, durationMs: 2000 },
  ],
};

/**
 * 经营组合夹具的注入选项：测试可注入受控替身驱动协作行为；
 * 缺省项由夹具内部以引擎无关实现兜底，不依赖 cc/fgui。
 */
export interface TycoonFixtureOptions {
  /** 可控模拟时钟：缺省为内建时钟（从 0 开始，测试经 fixture.clock.advance 推进）。 */
  readonly clock?: TycoonClock;
  /** 配置内容：驱动产品数值与初始现金；缺省为内建缺省配置。 */
  readonly configContent?: Record<string, unknown>;
  /** 平台存储后端：缺省为内存存储；观察版本化存档写入/读取。 */
  readonly storage?: PlatformStorage;
}

/** 经营组合夹具：在 GameFixture 生命周期接缝之上暴露各能力钩子。 */
export interface TycoonFixture extends GameFixture {
  /** 生产链控制器：读取进度，驱动生产任务推进。 */
  readonly production: {
    readonly state: {
      readonly activeProductId: string | null;
      readonly progress: number;
    };
    start(productId: string): boolean;
  };
  /** 经济控制器：现金与库存；出售库存换现金。 */
  readonly economy: {
    readonly state: {
      readonly cash: number;
      readonly inventory: Readonly<Record<string, number>>;
    };
    readonly cash: number;
    readonly inventory: Readonly<Record<string, number>>;
    sell(productId: string): boolean;
  };
  /** 被动调度器：tick 推进生产任务。 */
  readonly scheduler: {
    tick(): void;
  };
  /** 可控模拟时钟：推进生产时长，驱动任务完成。 */
  readonly clock: TycoonClock;
  /** 版本化存档：经营状态持久化后可版本化往返。 */
  readonly storage: {
    readonly currentVersion: number;
    save(namespace: string, key: string, data: unknown): Promise<void>;
    load(
      namespace: string,
      key: string,
    ): Promise<{ version: number; data: unknown } | null>;
  };
  /** 配置驱动数值：产品清单与初始现金来自不可变配置表。 */
  readonly config: {
    readonly products: readonly {
      readonly id: string;
      readonly name: string;
      readonly cost: number;
      readonly price: number;
      readonly durationMs: number;
    }[];
    readonly startCash: number;
  };
  /** UI 导航器：分层 UI 经不同层级 route 呈现经营状态。 */
  readonly navigator: UiNavigator;
}

/** 缺省内存平台存储：实现 PlatformStorage，供测试与非 Cocos 环境使用。 */
class MemoryStorage implements PlatformStorage {
  private readonly entries = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.entries.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.entries.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }
}

/**
 * 经营组合夹具装配：显式声明模块清单，构造统一生命周期接缝，并把各能力
 * 钩子暴露给测试驱动。组合逻辑留在游戏层夹具内，AppRoot 只做薄转发
 * （design decision 3/4）。可控时间、调度、配置、生产、经济、存档、分层
 * UI 七类能力协作。
 */
export function createTycoonFixture(
  options: TycoonFixtureOptions = {},
): TycoonFixture {
  const clock = options.clock ?? createTycoonClock();
  const config: TycoonConfigHandle = createTycoonConfig(
    options.configContent ?? DEFAULT_TYCOON_CONFIG_CONTENT,
  );
  const economy: TycoonEconomyHandle = createTycoonEconomy(config);
  const production: TycoonProductionHandle = createTycoonProduction(
    clock,
    config,
    economy,
  );
  const scheduler: TycoonScheduler = createTycoonScheduler(clock);
  const save: TycoonSave = createTycoonSave(
    options.storage ?? new MemoryStorage(),
  );
  const navigator: UiNavigator = createUiNavigator();

  // 生产任务经调度器推进：每个 tick 结算一次生产进度，按配置时长完成入库存
  scheduler.schedule(() => production.applyTick(), PRODUCTION_TICK_MS, {
    repeat: true,
  });

  const modules: Module[] = [
    createTycoonClockModule(clock),
    createTycoonSchedulerModule(scheduler),
    createTycoonConfigModule(config),
    createTycoonProductionModule(production),
    createTycoonEconomyModule(economy),
    createTycoonSaveModule(save),
    createTycoonUiModule(navigator),
  ];

  const base = createGameFixture({
    id: "tycoon",
    modules,
  });

  let disposed = false;

  return {
    ...base,
    production: {
      get state() {
        return production.state;
      },
      start: (productId: string) => production.start(productId),
    },
    economy: {
      get state() {
        return economy.state;
      },
      get cash() {
        return economy.cash;
      },
      get inventory() {
        return economy.inventory;
      },
      sell: (productId: string) => economy.sell(productId),
    },
    scheduler: {
      tick: () => scheduler.tick(),
    },
    clock,
    storage: {
      get currentVersion() {
        return save.currentVersion;
      },
      save: (namespace: string, key: string, data: unknown) =>
        save.save(namespace, key, data),
      load: (namespace: string, key: string) => save.load(namespace, key),
    },
    config: {
      products: config.products,
      startCash: config.startCash,
    },
    navigator,
    dispose: async () => {
      if (disposed) {
        return;
      }
      disposed = true;
      // 统一释放组合根持有的共享能力：模块 dispose 保持无副作用，
      // 避免 failRollback 探针复用模块实例时提前销毁夹具自身能力
      scheduler.dispose();
      production.dispose();
      navigator.dispose();
      await base.dispose();
    },
  };
}
