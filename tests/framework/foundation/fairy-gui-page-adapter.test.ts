import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

// 3.2 实现值导入 fairygui-cc，防御性 mock 避免转绿时加载真实 fairygui.mjs 崩溃。
// bun 的 mock.module 按测试文件隔离，不影响 cocos-ui-root / approot 等既有注册。
mock.module("fairygui-cc", () => ({
  GRoot: {
    get inst(): never {
      throw new Error("Call GRoot.create first!");
    },
    create() {
      return { name: "GRoot" };
    },
  },
  UIPackage: {
    addPackage(path: string) {
      return { name: path, path };
    },
    removePackage(_name: string) {},
    createObject(_pkg: string, _res: string) {
      return null;
    },
  },
  GComponent: class {
    name = "";
  },
}));

import { createResourceProvider } from "../../../assets/framework/core/resource/ResourceProvider";
import type { IResourceProvider } from "../../../assets/framework/contracts/resource/ResourceProvider";
import type {
  ResourceHandle,
  ResourceKey,
} from "../../../assets/framework/contracts/resource/Resource";
import {
  UI_LAYER_ORDER,
  type UiLayer,
} from "../../../assets/framework/contracts/ui/Navigation";

// ---- 接缝类型（task 3.2 扩展 CocosUiRoot.GRootLike 时的对齐目标）----
interface FairyGuiContainerLike {
  readonly name: string;
  addChild(child: unknown): unknown;
  removeChild(child: unknown, dispose?: boolean): unknown;
  removeChildren(beginIndex?: number, endIndex?: number, dispose?: boolean): void;
  getChildAt(index: number): unknown;
  get numChildren(): number;
}

interface FairyGuiRootLike extends FairyGuiContainerLike {}

interface FairyGuiViewLike {
  readonly name: string;
  dispose(): void;
}

// ---- Adapter 契约（红期锁定，3.2 实现必须匹配）----
interface FairyGuiPageAdapterOptions {
  /** GRoot 接缝：测试注入 mock，绕过 CocosUiRoot。 */
  readonly root: FairyGuiRootLike;
  /** 资源入口：loadPackage / createScope。 */
  readonly provider: IResourceProvider;
  /** 页面创建接缝：按 package + 资源名创建页面视图，可抛错模拟失败。 */
  readonly createView?: (
    packageName: string,
    resName: string,
  ) => FairyGuiViewLike;
}

interface FairyGuiPageHandle {
  readonly route: string;
  readonly layer: UiLayer;
  readonly view: FairyGuiViewLike | undefined;
  readonly mounted: boolean;
  readonly disposed: boolean;
  /** 创建失败时保留的诊断信息；成功时为 undefined。 */
  readonly error: unknown;
}

interface FairyGuiPageAdapter {
  /** 按 UI_LAYER_ORDER 建立七层 GRoot 容器，幂等。 */
  init(): void;
  containerFor(layer: UiLayer): FairyGuiContainerLike | undefined;
  createPage(
    route: string,
    layer: UiLayer,
    options?: { packageName?: string; resName?: string },
  ): FairyGuiPageHandle;
  mount(page: FairyGuiPageHandle): void;
  /** 移除挂载；重复卸载幂等。 */
  unmount(page: FairyGuiPageHandle): void;
  /** view.dispose + 逆序释放；重复销毁幂等。 */
  destroy(page: FairyGuiPageHandle): void;
  /** 消费导航模态状态：呈现遮罩并阻断输入，幂等。 */
  setModal(modal: boolean): void;
  dispose(): void;
}

interface FairyGuiPageAdapterFactory {
  createFairyGuiPageAdapter(options: FairyGuiPageAdapterOptions): FairyGuiPageAdapter;
}

const projectRoot = resolve(import.meta.dir, "../../..");
const adapterFile = resolve(
  projectRoot,
  "assets/framework/adapters/cocos/ui/FairyGuiPageAdapter.ts",
);

async function loadFactory(): Promise<FairyGuiPageAdapterFactory> {
  const exports = (await import(
    pathToFileURL(adapterFile).href
  )) as Partial<FairyGuiPageAdapterFactory>;

  expect(typeof exports.createFairyGuiPageAdapter).toBe("function");

  return {
    createFairyGuiPageAdapter:
      exports.createFairyGuiPageAdapter as FairyGuiPageAdapterFactory["createFairyGuiPageAdapter"],
  };
}

// ---- 记录型 root mock：跟踪容器创建、挂载、卸载与遮罩操作 ----
interface ContainerCall {
  readonly container: string;
  readonly action: string;
  readonly child?: unknown;
}

function createRecordingRoot(): {
  readonly root: FairyGuiRootLike;
  readonly calls: ContainerCall[];
  readonly containers: Map<string, FairyGuiContainerLike>;
} {
  const calls: ContainerCall[] = [];
  const containers = new Map<string, FairyGuiContainerLike>();

  function makeContainer(name: string): FairyGuiContainerLike {
    const children: unknown[] = [];
    return {
      name,
      addChild(child) {
        children.push(child);
        calls.push({ container: name, action: "addChild", child });
        return child;
      },
      removeChild(child, dispose = false) {
        const index = children.indexOf(child);
        if (index >= 0) {
          children.splice(index, 1);
        }
        calls.push({ container: name, action: "removeChild", child });
        return child;
      },
      removeChildren(beginIndex = 0, endIndex?: number, dispose = false) {
        const toRemove = children.splice(beginIndex, endIndex);
        calls.push({
          container: name,
          action: "removeChildren",
          child: toRemove,
        });
      },
      getChildAt(index) {
        return children[index];
      },
      get numChildren() {
        return children.length;
      },
    };
  }

  const root: FairyGuiRootLike = {
    name: "GRoot",
    addChild(child) {
      calls.push({ container: "GRoot", action: "addChild", child });
      // 返回记录型容器包装：adapter 将 addChild 的返回值作为该层容器持有，
      // 从而容器级调用（mount/unmount/setModal）可被观测（真实 GRoot.addChild 亦返回子对象）
      const name = (child as { name?: string } | undefined)?.name ?? "unknown";
      const container = makeContainer(name);
      containers.set(name, container);
      return container;
    },
    removeChild(child, dispose = false) {
      calls.push({ container: "GRoot", action: "removeChild", child });
      return child;
    },
    removeChildren(beginIndex = 0, endIndex?: number, dispose = false) {
      calls.push({ container: "GRoot", action: "removeChildren" });
    },
    getChildAt(_index: number) {
      return undefined;
    },
    get numChildren() {
      return 0;
    },
  };

  return { root, calls, containers };
}

function findContainerCalls(
  calls: readonly ContainerCall[],
  containerName: string,
  action: string,
): ContainerCall[] {
  return calls.filter(
    (call) => call.container === containerName && call.action === action,
  );
}

describe("FairyGuiPageAdapter", () => {
  test("init establishes seven GRoot containers in UI_LAYER_ORDER", async () => {
    const { createFairyGuiPageAdapter } = await loadFactory();
    const recording = createRecordingRoot();

    const adapter = createFairyGuiPageAdapter({
      root: recording.root,
      provider: createResourceProvider({ loader: () => Promise.resolve(), unloadBundle: () => {} }),
    });

    // 红期：adapter 尚未实现，init 不存在
    adapter.init();

    const addCalls = recording.calls.filter((call) => call.action === "addChild");
    expect(addCalls).toHaveLength(UI_LAYER_ORDER.length);
    expect(addCalls.map((call) => (call.child as { name?: string } | undefined)?.name)).toEqual(
      [...UI_LAYER_ORDER],
    );

    // 重复 init 幂等：不重复创建容器
    adapter.init();
    expect(
      recording.calls.filter((call) => call.action === "addChild"),
    ).toHaveLength(UI_LAYER_ORDER.length);
  });

  test("createPage uses explicit package/resName parameters", async () => {
    const { createFairyGuiPageAdapter } = await loadFactory();
    const recording = createRecordingRoot();
    const createView = mock((packageName: string, resName: string) => ({
      name: `${packageName}:${resName}`,
      dispose: mock(() => {}),
    }));

    const adapter = createFairyGuiPageAdapter({
      root: recording.root,
      provider: createResourceProvider({ loader: () => Promise.resolve(), unloadBundle: () => {} }),
      createView,
    });

    const page = adapter.createPage("hero", "popup", {
      packageName: "ui",
      resName: "Hero",
    });

    expect(page.route).toBe("hero");
    expect(page.layer).toBe("popup");
    expect(page.view?.name).toBe("ui:Hero");
    expect(createView).toHaveBeenCalledWith("ui", "Hero");
    expect(page.error).toBeUndefined();
  });

  test("mount attaches the page view to its declared layer container", async () => {
    const { createFairyGuiPageAdapter } = await loadFactory();
    const recording = createRecordingRoot();

    const adapter = createFairyGuiPageAdapter({
      root: recording.root,
      provider: createResourceProvider({ loader: () => Promise.resolve(), unloadBundle: () => {} }),
      createView: () => ({ name: "view", dispose: () => {} }),
    });

    adapter.init();
    const page = adapter.createPage("hero", "popup", {
      packageName: "ui",
      resName: "Hero",
    });
    adapter.mount(page);

    expect(page.mounted).toBe(true);
    const popupCalls = findContainerCalls(recording.calls, "popup", "addChild");
    expect(popupCalls).toHaveLength(1);
  });

  test("unmount removes the page and repeated unmount is idempotent", async () => {
    const { createFairyGuiPageAdapter } = await loadFactory();
    const recording = createRecordingRoot();

    const adapter = createFairyGuiPageAdapter({
      root: recording.root,
      provider: createResourceProvider({ loader: () => Promise.resolve(), unloadBundle: () => {} }),
      createView: () => ({ name: "view", dispose: () => {} }),
    });

    adapter.init();
    const page = adapter.createPage("hero", "popup", {
      packageName: "ui",
      resName: "Hero",
    });
    adapter.mount(page);
    adapter.unmount(page);
    adapter.unmount(page);

    expect(page.mounted).toBe(false);
    const removeCalls = findContainerCalls(
      recording.calls,
      "popup",
      "removeChild",
    );
    expect(removeCalls).toHaveLength(1);
  });

  test("destroy disposes the view and is idempotent", async () => {
    const { createFairyGuiPageAdapter } = await loadFactory();
    const recording = createRecordingRoot();
    const viewDispose = mock(() => {});
    const view = { name: "view", dispose: viewDispose };

    const adapter = createFairyGuiPageAdapter({
      root: recording.root,
      provider: createResourceProvider({ loader: () => Promise.resolve(), unloadBundle: () => {} }),
      createView: () => view,
    });

    adapter.init();
    const page = adapter.createPage("hero", "popup", {
      packageName: "ui",
      resName: "Hero",
    });
    adapter.destroy(page);
    adapter.destroy(page);

    expect(page.disposed).toBe(true);
    expect(viewDispose).toHaveBeenCalledTimes(1);
  });

  test("a failing createView reports diagnostics and leaves the page unmounted", async () => {
    const { createFairyGuiPageAdapter } = await loadFactory();
    const recording = createRecordingRoot();
    const original = new Error("ui package missing");

    const adapter = createFairyGuiPageAdapter({
      root: recording.root,
      provider: createResourceProvider({ loader: () => Promise.resolve(), unloadBundle: () => {} }),
      createView: () => {
        throw original;
      },
    });

    adapter.init();
    const page = adapter.createPage("hero", "popup", {
      packageName: "ui",
      resName: "Missing",
    });

    expect(page.view).toBeUndefined();
    expect(page.mounted).toBe(false);
    expect(page.disposed).toBe(true);
    expect(page.error).toBe(original);
  });

  test("destroy releases view then package bundle in reverse order", async () => {
    const { createFairyGuiPageAdapter } = await loadFactory();
    const unloaded: string[] = [];
    const { loader, pending } = createControlledLoader();
    const provider = createResourceProvider({
      loader,
      unloadBundle: (bundle: string) => {
        unloaded.push(bundle);
      },
    });

    const recording = createRecordingRoot();
    const viewDispose = mock(() => {
      unloaded.push("view-dispose");
    });

    const adapter = createFairyGuiPageAdapter({
      root: recording.root,
      provider,
      createView: () => ({ name: "view", dispose: viewDispose }),
    });

    adapter.init();
    const page = adapter.createPage("hero", "popup", {
      packageName: "ui",
      resName: "Hero",
    });
    // 页面持有 package 参与作用域计数
    const handle = provider.loadPackage("ui", "main");
    pending[0].resolve({ id: "package" });
    await handle.done;
    const scope = provider.createScope();
    scope.retain(handle);
    adapter.mount(page);

    adapter.destroy(page);
    scope.release();

    // View 销毁先于 Bundle 释放（provider 作用域释放触发 unloadBundle）
    expect(unloaded).toEqual(["view-dispose", "ui"]);
  });

  test("a shared package is preserved while another page holds it", async () => {
    const { createFairyGuiPageAdapter } = await loadFactory();
    const unloaded: string[] = [];
    const { loader, pending } = createControlledLoader();
    const provider = createResourceProvider({
      loader,
      unloadBundle: (bundle: string) => {
        unloaded.push(bundle);
      },
    });

    const first = provider.createScope();
    const second = provider.createScope();
    const handle = provider.loadPackage("ui", "main");
    pending[0].resolve({ id: "package" });
    await handle.done;
    first.retain(handle);
    second.retain(handle);

    const recording = createRecordingRoot();
    const adapter = createFairyGuiPageAdapter({
      root: recording.root,
      provider,
      createView: () => ({ name: "view", dispose: () => {} }),
    });

    adapter.init();
    const pageA = adapter.createPage("a", "popup", {
      packageName: "ui",
      resName: "A",
    });
    const pageB = adapter.createPage("b", "popup", {
      packageName: "ui",
      resName: "B",
    });

    adapter.destroy(pageA);
    first.release();
    expect(provider.canUnload("ui")).toBe(false);
    expect(unloaded).toEqual([]);

    adapter.destroy(pageB);
    second.release();
    expect(provider.canUnload("ui")).toBe(true);
    expect(unloaded).toEqual(["ui"]);
  });

  test("setModal presents a mask on the system layer and blocks input, idempotently", async () => {
    const { createFairyGuiPageAdapter } = await loadFactory();
    const recording = createRecordingRoot();

    const adapter = createFairyGuiPageAdapter({
      root: recording.root,
      provider: createResourceProvider({ loader: () => Promise.resolve(), unloadBundle: () => {} }),
      createView: () => ({ name: "view", dispose: () => {} }),
    });

    adapter.init();
    adapter.setModal(true);

    const maskCalls = findContainerCalls(recording.calls, "system", "addChild");
    expect(maskCalls).toHaveLength(1);

    // 重复进入模态幂等：不重复添加遮罩
    adapter.setModal(true);
    expect(
      findContainerCalls(recording.calls, "system", "addChild"),
    ).toHaveLength(1);

    adapter.setModal(false);
    expect(
      findContainerCalls(recording.calls, "system", "removeChildren"),
    ).toHaveLength(1);
  });
});

// ---- 受控资源加载器（对齐 fairygui-package-loading.test.ts 模式）----
interface ControlledDeferred {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
}

interface ControlledLoader {
  readonly pending: readonly ControlledDeferred[];
  readonly loader: (key: ResourceKey) => Promise<unknown>;
}

function createControlledLoader(): ControlledLoader {
  const pending: ControlledDeferred[] = [];

  const loader = (key: ResourceKey): Promise<unknown> => {
    void key;
    return new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
    });
  };

  return { pending, loader };
}
