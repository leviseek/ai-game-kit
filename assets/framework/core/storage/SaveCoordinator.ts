import type {
  ApplicationVisibility,
  ApplicationVisibilityState,
} from "../../contracts/platform/Platform";

export interface SaveCoordinatorOptions {
  /** 可见性源：暂停（background）/退出与恢复（foreground）经它触发保存。 */
  readonly visibility: ApplicationVisibility;
  /** 触发保存的可见性状态集合；缺省 ["background"]（对应暂停与退出）。 */
  readonly triggerStates?: readonly ApplicationVisibilityState[];
  /**
   * 执行一次保存：读取当前状态并写入存档仓库。协调器保证同一时刻至多一个
   * 保存执行，生命周期窗口内的多次触发收敛到最后一次有效状态（合并写）。
   */
  readonly save: () => Promise<void>;
}

export interface SaveCoordinator {
  start(): void;
  dispose(): void;
}

/**
 * 生命周期保存协调器：订阅 ApplicationVisibility，在触发状态变化时调度保存，
 * 并保证保存串行执行、窗口内多次触发合并到最近一次有效状态，避免并发交错
 * 覆盖或丢失最后一次有效状态（7.6 保存收敛策略）。
 */
export function createSaveCoordinator(
  options: SaveCoordinatorOptions,
): SaveCoordinator {
  const triggerStates =
    options.triggerStates ?? (["background"] as readonly ApplicationVisibilityState[]);

  let unsubscribe: (() => void) | undefined;
  // 串行化状态：running 表示当前有保存执行；pending 表示执行期间又有触发，
  // 当前保存完成后需再执行一次以落到最新状态。
  let running = false;
  let pending = false;

  async function drain(): Promise<void> {
    running = true;
    try {
      do {
        pending = false;
        await options.save();
      } while (pending);
    } finally {
      running = false;
    }
  }

  function schedule(): void {
    if (running) {
      // 执行中触发：标记待处理，当前保存结束后收敛到最新状态
      pending = true;
      return;
    }
    void drain();
  }

  return {
    start() {
      if (unsubscribe !== undefined) {
        return;
      }
      unsubscribe = options.visibility.onVisibilityChange((state) => {
        // target ES2015：无 Array.prototype.includes，用 indexOf 判断触发状态
        if (triggerStates.indexOf(state) !== -1) {
          schedule();
        }
      });
    },
    dispose() {
      unsubscribe?.();
      unsubscribe = undefined;
    },
  };
}
