import { GRoot } from "fairygui-cc";

// 结构化的 GRoot 接缝：唯一权威容器形状。FairyGuiPageAdapter 直接复用本类型
// 作为其容器接缝，使 CocosUiRoot 初始化的 root 可直接作为页面适配器的 root
// 传入（真实 GRoot 为 GComponent 子类，天然满足）。缺省接缝返回引擎单例，
// 测试可注入按形状的 mock。
export interface GRootLike {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  addChild(child: unknown): unknown;
  removeChild(child: unknown, dispose?: boolean): unknown;
  removeChildren(beginIndex?: number, endIndex?: number, dispose?: boolean): void;
  getChildAt(index: number): unknown;
  readonly numChildren: number;
}

export interface CocosUiRootOptions {
  /** GRoot 获取接缝；缺省读取引擎 GRoot 单例，测试可注入 mock。 */
  readonly getRoot?: () => GRootLike;
}

export interface CocosUiRoot {
  /**
   * 初始化入口：获取 GRoot 并进入可用状态；重复调用幂等。
   * GRoot 未就绪时抛错上报，保持未初始化以便调用方在引擎 ready 后重试。
   */
  readonly init: () => void;
  /** 是否已初始化。 */
  readonly initialized: boolean;
  /** 已初始化的 GRoot；未初始化时为 undefined。 */
  readonly root: GRootLike | undefined;
}

/**
 * Cocos UI 根宿主：封装 GRoot 获取与运行时初始化时机。
 * fgui 类型只存在于本 Adapter 边界；AppRoot 经此工厂接入而不直接 import fgui。
 */
export function createCocosUiRoot(
  options: CocosUiRootOptions = {},
): CocosUiRoot {
  // 缺省接缝：读取引擎 GRoot 单例。GRoot.inst 在尚未 create 时抛错，
  // 捕获后走 create 完成首次初始化（引擎启动后首次可用时初始化）。
  const getRoot = options.getRoot ?? (() => {
    try {
      return GRoot.inst;
    } catch {
      return GRoot.create();
    }
  });

  let root: GRootLike | undefined;
  let initialized = false;

  return {
    get initialized(): boolean {
      return initialized;
    },
    get root(): GRootLike | undefined {
      return root;
    },
    init(): void {
      if (initialized) {
        return;
      }
      // 获取失败（GRoot 未就绪）时抛错上报而不静默吞掉，且不置 initialized；
      // getRoot 返回 undefined 同样视为未就绪，避免 initialized=true 而 root=undefined
      // 的不一致状态
      const next = getRoot();
      if (next === undefined) {
        throw new Error("GRoot is not available yet");
      }
      root = next;
      initialized = true;
    },
  };
}
