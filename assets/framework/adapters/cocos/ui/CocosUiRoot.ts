import { GRoot } from "fairygui-cc";

// 结构化的 GRoot 接缝：唯一权威容器形状。FairyGuiPageAdapter 直接复用本类型
// 作为其容器接缝，使 CocosUiRoot 初始化的 root 可直接作为页面适配器的 root
// 传入（真实 GRoot 为 GComponent 子类，天然满足）。缺省接缝返回引擎单例，
// 测试可注入按形状的 mock。
export interface GRootLike {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** 同步根布局尺寸：窗口尺寸变化时按新尺寸更新，使层级容器/页面不残留旧尺寸。 */
  setSize(width: number, height: number): void;
  addChild(child: unknown): unknown;
  removeChild(child: unknown, dispose?: boolean): unknown;
  removeChildren(beginIndex?: number, endIndex?: number, dispose?: boolean): void;
  getChildAt(index: number): unknown;
  readonly numChildren: number;
}

export interface CocosUiRootOptions {
  /** GRoot 获取接缝；缺省读取引擎 GRoot 单例，测试可注入 mock。 */
  readonly getRoot?: () => GRootLike;
  /**
   * 窗口尺寸变化订阅接缝：注册回调并返回退订。缺省订阅真实浏览器 window resize，
   * 非浏览器环境 no-op；测试可注入受控触发源。
   */
  readonly subscribeResize?: (
    callback: (width: number, height: number) => void,
  ) => () => void;
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
  /**
   * 注册根尺寸同步监听：窗口尺寸变化且根布局尺寸已更新后回调，返回退订。
   * 页面适配器经此前向同步层级容器尺寸。
   */
  readonly onResize: (
    callback: (width: number, height: number) => void,
  ) => () => void;
  /** 释放：退订窗口尺寸监听；幂等。 */
  readonly dispose: () => void;
}

/**
 * Cocos UI 根宿主：封装 GRoot 获取、运行时初始化时机与窗口尺寸同步。
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

  // 缺省订阅真实窗口 resize；非浏览器环境（Bun 测试）no-op。
  const subscribeResize =
    options.subscribeResize ??
    ((callback: (width: number, height: number) => void) => {
      if (typeof window === "undefined") {
        return () => {};
      }
      const onWindowResize = () => {
        callback(window.innerWidth, window.innerHeight);
      };
      window.addEventListener("resize", onWindowResize);
      return () => {
        window.removeEventListener("resize", onWindowResize);
      };
    });

  let root: GRootLike | undefined;
  let initialized = false;
  let unsubscribeResize: (() => void) | undefined;
  const resizeListeners = new Set<(width: number, height: number) => void>();

  function handleResize(width: number, height: number): void {
    if (!initialized || root === undefined) {
      // 未初始化时不同步：避免在 GRoot 尚未就绪前写入尺寸
      return;
    }
    // 先同步根布局尺寸，再通知监听者（页面适配器同步层级容器），保证
    // 监听者读取到的 root 尺寸已是新值
    root.setSize(width, height);
    for (const listener of Array.from(resizeListeners)) {
      listener(width, height);
    }
  }

  // 窗口尺寸变化订阅在根宿主创建时建立：resize 事件先于 GRoot 就绪时由
  // handleResize 的 initialized 守卫 no-op，init 后再触发才开始同步
  unsubscribeResize = subscribeResize(handleResize);

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
    onResize(callback): () => void {
      resizeListeners.add(callback);
      return () => {
        resizeListeners.delete(callback);
      };
    },
    dispose(): void {
      unsubscribeResize?.();
      unsubscribeResize = undefined;
      resizeListeners.clear();
      initialized = false;
      root = undefined;
    },
  };
}
