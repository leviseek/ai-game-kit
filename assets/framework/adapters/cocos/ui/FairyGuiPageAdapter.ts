import { GComponent, UIPackage } from "fairygui-cc";
import type { IResourceProvider } from "../../../contracts/resource/ResourceProvider";
import {
  UI_LAYER_ORDER,
  type UiLayer,
} from "../../../contracts/ui/Navigation";

// 结构化的 FairyGUI 容器接缝：只依赖页面适配器用到的能力，便于测试注入 mock；
// 真实实现由 fgui 的 GComponent 满足，运行时作为 GRoot 子容器承载页面
export interface FairyGuiContainerLike {
  name: string;
  readonly width: number;
  readonly height: number;
  addChild(child: unknown): unknown;
  removeChild(child: unknown, dispose?: boolean): unknown;
  removeChildren(beginIndex?: number, endIndex?: number, dispose?: boolean): void;
  getChildAt(index: number): unknown;
  get numChildren(): number;
}

/** GRoot 即根容器，语义上是 FairyGuiContainerLike 的别名。 */
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
  // 遮罩节点：进入模态时挂到 system 层容器，收敛时整体移除
  let mask: FairyGuiContainerLike | undefined;
  let initialized = false;
  let disposed = false;

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
      if (disposed) {
        return;
      }
      const system = containers.get("system");
      if (system === undefined) {
        return;
      }
      if (modal && mask === undefined) {
        // 遮罩节点挂到最高层 system 容器，全屏尺寸对齐 GRoot、触摸可命中，
        // 阻断下层页面输入；收敛时精确移除，避免误删 system 层其它页面
        const created = new GComponent();
        created.name = "modal-mask";
        created.setSize(options.root.width, options.root.height);
        created.touchable = true;
        mask = created;
        system.addChild(created);
      } else if (!modal && mask !== undefined) {
        // 精确移除遮罩，避免误删 system 层其它页面（toast/loading/system 同层）
        system.removeChild(mask);
        mask = undefined;
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
