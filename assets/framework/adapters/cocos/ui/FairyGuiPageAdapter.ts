import { GComponent, GGraph, UIConfig, UIPackage } from "fairygui-cc";
import type { IResourceProvider } from "../../../contracts/resource/ResourceProvider";
import {
  UI_LAYER_ORDER,
  type UiLayer,
} from "../../../contracts/ui/Navigation";
import type { UiNavigator } from "../../../core/ui/UiNavigator";
import type { GRootLike } from "./CocosUiRoot";

// 层容器与 GRoot 同为 GComponent 子类，容器接缝复用 CocosUiRoot 的权威
// GRootLike 形状，避免两处重复定义漂移。真实实现由 fgui 的 GComponent 满足，
// 运行时作为 GRoot 子容器承载页面
export type FairyGuiContainerLike = GRootLike;

/** GRoot 即根容器，语义上是容器接缝的别名。 */
export type FairyGuiRootLike = FairyGuiContainerLike;

export interface FairyGuiViewLike {
  readonly name: string;
  dispose(): void;
}

export interface FairyGuiPageAdapterOptions {
  /** GRoot 接缝：真实运行时为 fgui 的 GRoot，测试可注入 mock。 */
  readonly root: FairyGuiRootLike;
  /**
   * 资源入口（预留）：资源层能力已就绪（kind 分派 + removePackage 清理，task 3.3），
   * View → package → Bundle 逆序释放的编排由 4.x AppRoot 集成时经资源作用域驱动；
   * 当前 adapter 不直接读取本参数。
   */
  readonly provider?: IResourceProvider;
  /** 页面创建接缝：按 package + 资源名创建页面视图，可抛错模拟失败。 */
  readonly createView?: (
    packageName: string,
    resName: string,
  ) => FairyGuiViewLike;
  /**
   * 遮罩创建接缝：按 GRoot 尺寸创建模态遮罩对象。缺省用 GComponent 并设
   * `opaque`/`touchable` 保证命中阻断；测试可注入记录型 mock 观察遮罩属性。
   */
  readonly createMask?: (width: number, height: number) => unknown;
  /**
   * 导航器：提供时适配器消费其模态状态（默认读 `UiNavigator.modal`），包装其
   * 导航操作，阻断时自动呈现遮罩、收敛时自动移除，组合根无需手动调用 setModal。
   */
  readonly navigator?: UiNavigator;
}

/**
 * 缺省模态遮罩工厂：对齐 `GRoot._modalLayer` 模式，GGraph 画半透明填充呈现
 * 可见遮罩并命中阻断下层页面输入。
 * - 可见性：drawRect 用 `UIConfig.modalLayerColor`（半透明黑）填充，遮罩非透明可见
 * - 命中：GGraph 矩形 `_hitTest` 按尺寸直接命中自身；opaque 参与命中但 GGraph
 *   不依赖，显式配置以保持契约一致；touch 命中入口（GObject.hitTest）需 touchable，
 *   否则事件穿透到下层页面
 * - 覆盖：setSize 对齐 GRoot 尺寸，覆盖全部输入区域
 */
function createFairyGuiMask(width: number, height: number): unknown {
  const mask = new GGraph();
  mask.name = "modal-mask";
  mask.opaque = true;
  mask.touchable = true;
  mask.setSize(width, height);
  // lineSize=0 无线条；line/fill 复用 modalLayerColor，fill 决定可见性
  const modalColor = UIConfig.modalLayerColor;
  mask.drawRect(0, modalColor, modalColor);
  return mask;
}

/**
 * 缺省页面视图创建接缝：经 FairyGUI 包注册表按 package + 资源名创建视图。
 * 创建失败抛错保留诊断（与 createPage 失败语义一致）。只存在于 Adapter 边界，
 * 供 AppRoot 装配时传入，组合根不直接 import fgui 类型。
 */
export function createFairyGuiView(
  packageName: string,
  resName: string,
): FairyGuiViewLike {
  const view = UIPackage.createObject(packageName, resName);
  if (view === null) {
    throw new Error(
      `FairyGUI view "${resName}" in package "${packageName}" was not found`,
    );
  }
  return view as FairyGuiViewLike;
}

export interface FairyGuiPageHandle {
  readonly route: string;
  readonly layer: UiLayer;
  readonly view: FairyGuiViewLike | undefined;
  readonly mounted: boolean;
  readonly disposed: boolean;
  /** 创建失败时保留的诊断信息；成功时为 undefined。 */
  readonly error: unknown;
}

export interface FairyGuiPageAdapter {
  /** 按 UI_LAYER_ORDER 建立七层 GRoot 容器，重复调用幂等（idempotent）。 */
  init(): void;
  containerFor(layer: UiLayer): FairyGuiContainerLike | undefined;
  createPage(
    route: string,
    layer: UiLayer,
    options?: { packageName?: string; resName?: string },
  ): FairyGuiPageHandle;
  /** 按 route 查找未销毁的页面句柄；不存在返回 undefined。 */
  findPage(route: string): FairyGuiPageHandle | undefined;
  mount(page: FairyGuiPageHandle): void;
  /** 移除挂载；重复卸载幂等（idempotent）。 */
  unmount(page: FairyGuiPageHandle): void;
  /** 销毁页面 View（含先卸载挂载）；重复销毁幂等（idempotent）。package/Bundle 释放由调用方编排。 */
  destroy(page: FairyGuiPageHandle): void;
  /** 消费导航模态状态：呈现遮罩并阻断输入，重复调用幂等（idempotent）。 */
  setModal(modal: boolean): void;
  /** 窗口尺寸变化后同步层级容器与遮罩尺寸，避免残留旧尺寸影响呈现/命中。 */
  resize(width: number, height: number): void;
  dispose(): void;
}

/** 页面句柄的可变状态：接口只读，内部经 WeakMap 存取。 */
interface HandleState {
  mounted: boolean;
  disposed: boolean;
}

/**
 * FairyGUI 页面适配器：按 UI_LAYER_ORDER 建立 GRoot 子容器，对齐 UiPage
 * 生命周期（创建/挂载/卸载/销毁），并消费导航模态状态呈现遮罩。
 * fgui 类型只存在于本 Adapter 边界；页面与资源的映射由调用方显式传入。
 */
export function createFairyGuiPageAdapter(
  options: FairyGuiPageAdapterOptions,
): FairyGuiPageAdapter {
  const containers = new Map<UiLayer, FairyGuiContainerLike>();
  const pages = new Set<FairyGuiPageHandle>();
  const handleStates = new WeakMap<FairyGuiPageHandle, HandleState>();
  // 遮罩节点：进入模态时挂到 system 层容器，收敛时整体移除。
  // 遮罩是 GObject（GGraph），非容器接缝，仅作 system 容器子对象引用
  let mask: unknown | undefined;
  let initialized = false;
  let disposed = false;

  // 遮罩同步核心：setModal 与导航器包装共用，保证两种驱动路径语义一致。
  // 重复进入（mask 已存在）不重复添加，重复退出（mask 不存在）为 no-op，幂等。
  function applyModal(modal: boolean): void {
    if (disposed) {
      return;
    }
    const system = containers.get("system");
    if (system === undefined) {
      return;
    }
    if (modal && mask === undefined) {
      // 遮罩节点挂到最高层 system 容器，全屏尺寸对齐 GRoot、可命中（opaque）
      // 且可触摸（touchable），阻断下层页面输入；收敛时精确移除，避免误删
      // system 层其它页面
      const createMask = options.createMask ?? createFairyGuiMask;
      const created = createMask(options.root.width, options.root.height);
      mask = created;
      system.addChild(created);
    } else if (!modal && mask !== undefined) {
      // 精确移除遮罩，避免误删 system 层其它页面（toast/loading/system 同层）
      system.removeChild(mask);
      mask = undefined;
    }
  }

  function requireContainer(layer: UiLayer): FairyGuiContainerLike {
    const container = containers.get(layer);
    if (container === undefined) {
      throw new Error(`FairyGUI layer container "${layer}" is not initialized`);
    }
    return container;
  }

  function makeHandle(
    route: string,
    layer: UiLayer,
    view: FairyGuiViewLike | undefined,
    error: unknown,
  ): FairyGuiPageHandle {
    const state: HandleState = { mounted: false, disposed: false };
    const handle: FairyGuiPageHandle = {
      route,
      layer,
      view,
      error,
      get mounted(): boolean {
        return state.mounted;
      },
      get disposed(): boolean {
        return state.disposed;
      },
    };
    handleStates.set(handle, state);
    pages.add(handle);
    return handle;
  }

  // 消费导航器模态状态：导航器无事件推送，包装其导航操作，操作后重读
  // `modal` 同步遮罩，使"阻断自动呈现、收敛自动移除"随导航状态成立。
  // 组合根不再需要手动调用 setModal；未提供导航器时保持手动驱动路径。
  const navigator = options.navigator;
  let navigatorOriginalOpen: UiNavigator["open"] | undefined;
  let navigatorOriginalClose: UiNavigator["close"] | undefined;
  let navigatorOriginalBack: UiNavigator["back"] | undefined;
  let navigatorOriginalDispose: UiNavigator["dispose"] | undefined;

  function syncModalFromNavigator(): void {
    if (navigator !== undefined) {
      applyModal(navigator.modal === true);
    }
  }

  if (navigator !== undefined) {
    navigatorOriginalOpen = navigator.open;
    navigatorOriginalClose = navigator.close;
    navigatorOriginalBack = navigator.back;
    navigatorOriginalDispose = navigator.dispose;

    navigator.open = (
      route: string,
      navOptions?: { layer?: UiLayer; blocking?: boolean },
    ) => {
      const result = (navigatorOriginalOpen as UiNavigator["open"])(
        route,
        navOptions,
      );
      syncModalFromNavigator();
      return result;
    };
    navigator.close = (pageId?: string) => {
      const result = (navigatorOriginalClose as UiNavigator["close"])(pageId);
      syncModalFromNavigator();
      return result;
    };
    navigator.back = () => {
      const result = (navigatorOriginalBack as UiNavigator["back"])();
      syncModalFromNavigator();
      return result;
    };
    navigator.dispose = () => {
      (navigatorOriginalDispose as UiNavigator["dispose"])();
      // 导航器释放后栈清空、模态收敛，遮罩一并移除
      syncModalFromNavigator();
    };
  }

  return {
    init(): void {
      if (disposed) {
        return;
      }
      if (initialized) {
        return;
      }
      // 按层级契约建立七层容器，顺序即遮挡顺序（scene 最低、system 最高）。
      // 使用 root.addChild 的返回值作为容器引用（真实 GRoot.addChild 返回子对象）
      for (const layer of UI_LAYER_ORDER) {
        const created = new GComponent();
        created.name = layer;
        const container = options.root.addChild(created);
        containers.set(layer, container as FairyGuiContainerLike);
      }
      initialized = true;
    },
    containerFor(layer: UiLayer): FairyGuiContainerLike | undefined {
      return containers.get(layer);
    },
    findPage(route: string): FairyGuiPageHandle | undefined {
      // Array.from 而非展开：Creator 构建转译 `[...set]` 为 `[].concat(set)` 会破坏迭代
      return Array.from(pages).find((page) => page.route === route && !page.disposed);
    },
    createPage(
      route: string,
      layer: UiLayer,
      pageOptions?: { packageName?: string; resName?: string },
    ): FairyGuiPageHandle {
      if (disposed) {
        // dispose 后不可再创建页面：与 mount/unmount 一致走 disposed 早退，
        // 但需返回句柄，返回已销毁句柄避免调用方误挂载
        const handle = makeHandle(
          route,
          layer,
          undefined,
          new Error("page adapter is disposed"),
        );
        const state = handleStates.get(handle);
        if (state !== undefined) {
          state.disposed = true;
        }
        return handle;
      }
      const createView = options.createView;
      if (createView === undefined) {
        // 与创建失败路径一致的语义：无视图即视为已销毁、不挂载，保留诊断信息
        const handle = makeHandle(
          route,
          layer,
          undefined,
          new Error("createView is not configured"),
        );
        const state = handleStates.get(handle);
        if (state !== undefined) {
          state.disposed = true;
        }
        return handle;
      }
      try {
        // 显式参数化：package/resName 由调用方传入，adapter 不内建路由表
        const view = createView(
          pageOptions?.packageName ?? "",
          pageOptions?.resName ?? "",
        );
        return makeHandle(route, layer, view, undefined);
      } catch (error) {
        // 创建失败保留诊断信息，页面视为已销毁、不挂载
        const handle = makeHandle(route, layer, undefined, error);
        const state = handleStates.get(handle);
        if (state !== undefined) {
          state.disposed = true;
        }
        return handle;
      }
    },
    mount(page: FairyGuiPageHandle): void {
      if (disposed) {
        return;
      }
      const state = handleStates.get(page);
      if (state === undefined || state.disposed || state.mounted) {
        return;
      }
      if (page.view === undefined) {
        return;
      }
      const container = requireContainer(page.layer);
      container.addChild(page.view);
      state.mounted = true;
    },
    unmount(page: FairyGuiPageHandle): void {
      if (disposed) {
        return;
      }
      const state = handleStates.get(page);
      if (state === undefined || !state.mounted) {
        return;
      }
      if (page.view === undefined) {
        return;
      }
      const container = requireContainer(page.layer);
      container.removeChild(page.view);
      state.mounted = false;
    },
    destroy(page: FairyGuiPageHandle): void {
      if (disposed) {
        return;
      }
      const state = handleStates.get(page);
      if (state === undefined || state.disposed) {
        return;
      }
      // 先卸载挂载再从容器移除，再销毁 View；契约不依赖 fgui dispose 自动
      // 移除显示（自建包装视图可能不负责移除），保证销毁后容器无残留
      if (state.mounted && page.view !== undefined) {
        requireContainer(page.layer).removeChild(page.view);
      }
      page.view?.dispose();
      state.disposed = true;
      state.mounted = false;
    },
    setModal(modal: boolean): void {
      applyModal(modal);
    },
    resize(width: number, height: number): void {
      if (disposed) {
        return;
      }
      // 层级容器随窗口尺寸同步：GRoot 已由 UI 根宿主 setSize，容器若不更新
      // 会残留旧尺寸，影响页面呈现与命中覆盖范围
      for (const container of containers.values()) {
        container.setSize(width, height);
      }
      // 模态遮罩保持全屏覆盖：resize 后同步遮罩尺寸，继续阻断全部输入区域
      if (mask !== undefined) {
        (mask as { setSize?: (width: number, height: number) => void }).setSize?.(
          width,
          height,
        );
      }
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      // 先移除遮罩，避免残留显示节点
      if (mask !== undefined) {
        const system = containers.get("system");
        if (system !== undefined) {
          system.removeChild(mask);
        }
        mask = undefined;
      }
      // 恢复导航器原始方法：适配器释放后不再劫持导航操作，避免其闭包持有
      // 已释放适配器；导航器本身的生命周期由调用方管理
      if (navigator !== undefined && navigatorOriginalOpen !== undefined) {
        navigator.open = navigatorOriginalOpen;
        navigator.close = navigatorOriginalClose as UiNavigator["close"];
        navigator.back = navigatorOriginalBack as UiNavigator["back"];
        navigator.dispose = navigatorOriginalDispose as UiNavigator["dispose"];
      }
      // 页面按登记逆序销毁（后创建的页面先释放），对齐导航逆序释放契约。
      // Array.from 而非展开：Creator 构建转译 `[...set]` 为 `[].concat(set)` 会破坏迭代
      for (const page of Array.from(pages).reverse()) {
        const state = handleStates.get(page);
        if (state !== undefined && !state.disposed) {
          page.view?.dispose();
          state.disposed = true;
          state.mounted = false;
        }
      }
      pages.clear();
      // 七层容器从 GRoot 移除并清空；dispose 后容器/页面不可再用
      for (const container of containers.values()) {
        options.root.removeChild(container);
      }
      containers.clear();
      initialized = false;
    },
  };
}
