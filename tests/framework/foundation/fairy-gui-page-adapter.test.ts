import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

import { createFairyGuiMock } from "./helpers/fairygui-mock";
import {
  UI_LAYER_ORDER,
  type UiLayer,
} from "../../../assets/framework/contracts/ui/Navigation";

// 3.2 实现值导入 fairygui-cc，统一使用共享 fixture 避免全量运行解析失败。
// bun 的 mock.module 全局共享且首个注册生效，所有 mock 该模块的文件须注册相同内容。
mock.module("fairygui-cc", () => createFairyGuiMock());

// ---- 接缝类型（task 3.2 扩展 CocosUiRoot.GRootLike 时的对齐目标）----
interface FairyGuiContainerLike {
  name: string;
  readonly width: number;
  readonly height: number;
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
  /** 资源入口（预留）：adapter 不直接读取，逆序释放编排由 4.x 接入。 */
  readonly provider?: unknown;
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
  /** 销毁页面 View（含先卸载挂载）；重复销毁幂等。 */
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
      width: 1280,
      height: 720,
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
    width: 1280,
    height: 720,
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

function makeSimpleAdapter(
  createFairyGuiPageAdapter: FairyGuiPageAdapterFactory["createFairyGuiPageAdapter"],
  recording: ReturnType<typeof createRecordingRoot>,
  createView?: FairyGuiPageAdapterOptions["createView"],
): FairyGuiPageAdapter {
  return createFairyGuiPageAdapter({
    root: recording.root,
    createView: createView ?? (() => ({ name: "view", dispose: () => {} })),
  });
}

describe("FairyGuiPageAdapter", () => {
  test("init establishes seven GRoot containers in UI_LAYER_ORDER", async () => {
    const { createFairyGuiPageAdapter } = await loadFactory();
    const recording = createRecordingRoot();
    const adapter = makeSimpleAdapter(createFairyGuiPageAdapter, recording);

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
    const adapter = makeSimpleAdapter(createFairyGuiPageAdapter, recording, createView);

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
    const adapter = makeSimpleAdapter(createFairyGuiPageAdapter, recording);

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
    const adapter = makeSimpleAdapter(createFairyGuiPageAdapter, recording);

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

  test("destroy unmounts then disposes the view, and is idempotent", async () => {
    const { createFairyGuiPageAdapter } = await loadFactory();
    const recording = createRecordingRoot();
    const viewDispose = mock(() => {});
    const view = { name: "view", dispose: viewDispose };
    const adapter = createFairyGuiPageAdapter({
      root: recording.root,
      createView: () => view,
    });

    adapter.init();
    const page = adapter.createPage("hero", "popup", {
      packageName: "ui",
      resName: "Hero",
    });
    adapter.mount(page);
    adapter.destroy(page);
    adapter.destroy(page);

    expect(page.disposed).toBe(true);
    expect(viewDispose).toHaveBeenCalledTimes(1);
    // 销毁先移除挂载：popup 容器收到 removeChild，容器内无残留
    expect(
      findContainerCalls(recording.calls, "popup", "removeChild"),
    ).toHaveLength(1);
    expect(recording.containers.get("popup")?.numChildren).toBe(0);
  });

  test("a failing createView reports diagnostics and leaves the page unmounted", async () => {
    const { createFairyGuiPageAdapter } = await loadFactory();
    const recording = createRecordingRoot();
    const original = new Error("ui package missing");
    const adapter = createFairyGuiPageAdapter({
      root: recording.root,
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

  test("an unconfigured createView reports diagnostics and counts as disposed", async () => {
    const { createFairyGuiPageAdapter } = await loadFactory();
    const recording = createRecordingRoot();
    const adapter = createFairyGuiPageAdapter({ root: recording.root });

    adapter.init();
    const page = adapter.createPage("hero", "popup", {
      packageName: "ui",
      resName: "Hero",
    });

    expect(page.view).toBeUndefined();
    expect(page.mounted).toBe(false);
    expect(page.disposed).toBe(true);
    expect((page.error as Error)?.message).toMatch(/createView is not configured/);
  });

  test("setModal presents a mask on the system layer, removes it precisely, idempotently", async () => {
    const { createFairyGuiPageAdapter } = await loadFactory();
    const recording = createRecordingRoot();
    const adapter = makeSimpleAdapter(createFairyGuiPageAdapter, recording);

    adapter.init();
    // 预置一个 system 层页面，验证模态收敛只移除遮罩、不误删其它子对象
    const system = recording.containers.get("system");
    expect(system).toBeDefined();
    const other = { name: "system-toast" };
    system?.addChild(other);

    adapter.setModal(true);

    const maskCalls = findContainerCalls(recording.calls, "system", "addChild");
    // 预置页面 + 遮罩
    expect(maskCalls).toHaveLength(2);

    // 遮罩为全屏且可命中触摸，阻断下层输入
    const mask = maskCalls[1].child as {
      width?: number;
      height?: number;
      touchable?: boolean;
    };
    expect(mask.width).toBe(recording.root.width);
    expect(mask.height).toBe(recording.root.height);
    expect(mask.touchable).toBe(true);

    // 重复进入模态幂等：不重复添加遮罩
    adapter.setModal(true);
    expect(
      findContainerCalls(recording.calls, "system", "addChild"),
    ).toHaveLength(2);

    adapter.setModal(false);
    // 精确移除遮罩，保留预置页面
    const removeCalls = findContainerCalls(recording.calls, "system", "removeChild");
    expect(removeCalls).toHaveLength(1);
    expect(system?.getChildAt(0)).toBe(other);
    expect(system?.numChildren).toBe(1);
  });

  test("dispose removes containers from the root and leaves no residual mask", async () => {
    const { createFairyGuiPageAdapter } = await loadFactory();
    const recording = createRecordingRoot();
    const adapter = makeSimpleAdapter(createFairyGuiPageAdapter, recording);

    adapter.init();
    const page = adapter.createPage("hero", "popup", {
      packageName: "ui",
      resName: "Hero",
    });
    adapter.mount(page);
    adapter.setModal(true);

    adapter.dispose();

    // 七个容器都从 GRoot 移除（遮罩移除记录在 system 容器级，不算入此）
    expect(
      recording.calls.filter(
        (call) => call.container === "GRoot" && call.action === "removeChild",
      ),
    ).toHaveLength(UI_LAYER_ORDER.length);
    // 遮罩被移除，system 容器不再持有任何子对象
    const system = recording.containers.get("system");
    expect(system?.numChildren).toBe(0);
    // 页面在 dispose 时被销毁
    expect(page.disposed).toBe(true);
  });
});
