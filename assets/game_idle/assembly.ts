import type {
  Module,
  PlatformStorage,
} from "../framework";
import {
  createGameFixture,
  type GameFixture,
} from "../game/fixture/GameFixture";
import { createIdleClock, createIdleClockModule, type IdleClock } from "./clock";
import type {
  IdleOfflineSettlement,
  IdleProgressState,
} from "./models";
import {
  createIdleProgress,
  createIdleProgressModule,
  ONLINE_TICK_MS,
  type IdleProgressHandle,
} from "./progress";
import {
  createIdleSave,
  createIdleSaveModule,
  type IdleSave,
} from "./save";
import {
  createIdleScheduler,
  createIdleSchedulerModule,
  type IdleScheduler,
} from "./scheduler";

/**
 * 挂机组合夹具的注入选项：测试可注入受控替身驱动协作行为；
 * 缺省项由夹具内部以引擎无关实现兜底，不依赖 cc/fgui。
 */
export interface IdleFixtureOptions {
  /** 可控墙钟：缺省为内建时钟（从 0 开始，测试经 fixture.clock.advance 推进）。 */
  readonly clock?: IdleClock;
  /** 平台存储后端：缺省为内存存储；观察版本化存档写入/读取。 */
  readonly storage?: PlatformStorage;
}

/** 挂机组合夹具：在 GameFixture 生命周期接缝之上暴露各能力钩子。 */
export interface IdleFixture extends GameFixture {
  /** 成长进度：等级与金币；离线收益结算后写存档。 */
  readonly progress: {
    readonly state: IdleProgressState;
    readonly level: number;
    readonly gold: number;
    advanceLevel(): void;
  };
  /** 可控墙钟：推进模拟离线时长，驱动离线收益结算。 */
  readonly clock: IdleClock;
  /** 被动调度器：tick 推进在线收益任务。 */
  readonly scheduler: {
    tick(): void;
  };
  /** 版本化存档：离线收益持久化后可版本化往返。 */
  readonly storage: {
    readonly currentVersion: number;
    save(namespace: string, key: string, data: unknown): Promise<void>;
    load(
      namespace: string,
      key: string,
    ): Promise<{ version: number; data: unknown } | null>;
  };
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
 * 挂机组合夹具装配：显式声明模块清单，构造统一生命周期接缝，并把各能力
 * 钩子暴露给测试驱动。组合逻辑留在游戏层夹具内，AppRoot 只做薄转发
 * （design decision 3/4）。墙钟、调度、成长进度、版本化存档四类能力协作。
 */
export function createIdleFixture(
  options: IdleFixtureOptions = {},
): IdleFixture {
  const clock = options.clock ?? createIdleClock();
  const storage = options.storage ?? new MemoryStorage();
  const progress: IdleProgressHandle = createIdleProgress(clock);
  const scheduler: IdleScheduler = createIdleScheduler(clock);
  const save: IdleSave = createIdleSave(storage);

  // 在线收益任务：墙钟推进一个 tick 间隔后由调度器结算一次在线收益
  scheduler.schedule(() => progress.applyOnlineTick(), ONLINE_TICK_MS, {
    repeat: true,
  });

  const modules: Module[] = [
    createIdleClockModule(clock),
    createIdleSchedulerModule(scheduler),
    createIdleProgressModule(progress),
    createIdleSaveModule(save),
  ];

  const base = createGameFixture({
    id: "idle",
    modules,
  });

  let disposed = false;

  /**
   * 离线收益结算与持久化：暂停→恢复衔接时写入版本化存档。
   * 先内存结算（金币入账、离线起点消费），再写存档。若存档写入失败，
   * resume reject 但金币已在内存结算；后续成功 resume 会按新结算重写补齐，
   * 不产生重复累计（离线起点已消费，重复 resume 只结算 0 时长）。
   */
  const settleOfflineAndSave = async (): Promise<IdleOfflineSettlement> => {
    const settlement = progress.onResume();
    await save.save("idle", "progress", {
      level: progress.level,
      gold: progress.gold,
    });
    return settlement;
  };

  return {
    ...base,
    progress: {
      get state() {
        return progress.state;
      },
      get level() {
        return progress.level;
      },
      get gold() {
        return progress.gold;
      },
      advanceLevel: () => progress.advanceLevel(),
    },
    clock,
    scheduler: {
      tick: () => scheduler.tick(),
    },
    storage: {
      get currentVersion() {
        return save.currentVersion;
      },
      save: (namespace: string, key: string, data: unknown) =>
        save.save(namespace, key, data),
      load: (namespace: string, key: string) => save.load(namespace, key),
    },
    pause: async () => {
      // 暂停衔接：先推进应用状态，成功后再记录离线起点。若 base.pause() 因
      // 状态错误 reject，不留下"从未真正暂停"的幽灵离线窗口
      await base.pause();
      progress.onPause();
    },
    resume: async () => {
      // 恢复衔接：先恢复应用状态，再按墙钟累计离线时长结算并持久化
      await base.resume();
      await settleOfflineAndSave();
    },
    dispose: async () => {
      if (disposed) {
        return;
      }
      disposed = true;
      // 统一释放组合根持有的共享能力：模块 dispose 保持无副作用，
      // 避免 failRollback 探针复用模块实例时提前销毁夹具自身能力
      scheduler.dispose();
      progress.dispose();
      await base.dispose();
    },
  };
}
