import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

import { createFairyGuiMock } from "./helpers/fairygui-mock";

// 适配器经 createFairyGuiPageAdapter 工厂间接依赖 fairygui-cc；测试不加载真实
// 运行时，统一使用共享 fixture（bun mock.module 全局共享首个生效）。
mock.module("fairygui-cc", () => createFairyGuiMock());

// ---- 接缝类型（与 fairy-gui-page-adapter.test.ts 对齐的容器接缝形状）----
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

// 页面视图接缝：命中模拟需要可触摸与尺寸
interface FairyGuiViewLike {
  readonly name: string;
  dispose(): void;
  touchable?: boolean;
  width?: number;
  height?: number;
}

interface FairyGuiPageHandle {
  readonly route: string;
  readonly view: FairyGuiViewLike | undefined;
  readonly mounted: boolean;
  readonly disposed: boolean;
}

interface FairyGuiPageAdapterOptions {
  readonly root: FairyGuiRootLike;
  readonly createView?: (
    packageName: string,
    resName: string,
  ) => FairyGuiViewLike;
  readonly createMask?: (width: number, height: number) => unknown;
}

interface FairyGuiPageAdapter {
  init(): void;
  createPage(
    route: string,
    layer: string,
    options?: { packageName?: string; resName?: string },
  ): FairyGuiPageHandle;
  mount(page: FairyGuiPageHandle): void;
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

// ---- 记录型 root mock：跟踪 system 层遮罩/页面的添加与移除 ----
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
      removeChild(child, _dispose = false) {
        const index = children.indexOf(child);
        if (index >= 0) {
          children.splice(index, 1);
        }
        calls.push({ container: name, action: "removeChild", child });
        return child;
      },
      removeChildren(beginIndex = 0, endIndex?: number, _dispose = false) {
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
      const name = (child as { name?: string } | undefined)?.name ?? "unknown";
      const container = makeContainer(name);
      containers.set(name, container);
      return container;
    },
    removeChild(child, _dispose = false) {
      calls.push({ container: "GRoot", action: "removeChild", child });
      return child;
    },
    removeChildren(_beginIndex = 0, _endIndex?: number, _dispose = false) {
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

// ---- 遮罩形状：GGraph 具备 drawRect 填充记录，GComponent 空容器没有 ----
interface MaskLike {
  readonly name: string;
  width: number;
  height: number;
  touchable: boolean;
  opaque: boolean;
  lineSize?: number;
  lineColor?: { r: number; g: number; b: number; a: number };
  fillColor?: { r: number; g: number; b: number; a: number };
}

function isGraphMask(value: unknown): value is MaskLike {
  const mask = value as MaskLike | undefined;
  return (
    mask !== undefined &&
    typeof mask.lineSize === "number" &&
    mask.fillColor !== undefined
  );
}

// 模拟 FairyGUI 命中规则：从最上层子对象向下查找第一个可触摸且点在其尺寸内者。
// 真实命中链见 GObject.hitTest（touch 命中需 touchable）与 GComponent._hitTest
// （自顶向下找第一个命中子对象）。
function hitTestAt(
  container: FairyGuiContainerLike,
  x: number,
  y: number,
): unknown | undefined {
  for (let index = container.numChildren - 1; index >= 0; index -= 1) {
    const child = container.getChildAt(index) as {
      touchable?: boolean;
      width?: number;
      height?: number;
    };
    if (
      child.touchable !== false &&
      x >= 0 &&
      y >= 0 &&
      x < (child.width ?? 0) &&
      y < (child.height ?? 0)
    ) {
      return child;
    }
  }
  return undefined;
}

function getMask(recording: ReturnType<typeof createRecordingRoot>): MaskLike {
  const maskCalls = findContainerCalls(recording.calls, "system", "addChild");
  expect(maskCalls).toHaveLength(1);
  return maskCalls[0].child as MaskLike;
}

describe("modal mask visibility and input blocking", () => {
  test("default mask is a visible GGraph with a non-transparent fill", async () => {
    const { createFairyGuiPageAdapter } = await loadFactory();
    const recording = createRecordingRoot();
    const adapter = createFairyGuiPageAdapter({ root: recording.root });
    adapter.init();

    adapter.setModal(true);
    const mask = getMask(recording);

    // GGraph 呈现：具备 drawRect 填充记录（空 GComponent 无此字段），对齐
    // GRoot._modalLayer 模式；遮罩因此可见而非透明空容器
    expect(isGraphMask(mask)).toBe(true);
    // 可见：填充色非全透明（alpha > 0，来自 UIConfig.modalLayerColor 半透明黑）
    expect((mask.fillColor as { a: number }).a).toBeGreaterThan(0);
    // 输入阻断配置：可触摸（touch 命中入口通过）且全屏覆盖输入区域
    expect(mask.touchable).toBe(true);
    expect(mask.width).toBe(recording.root.width);
    expect(mask.height).toBe(recording.root.height);
  });

  test("mask blocks input over its coverage area and clicks do not reach the underlying page", async () => {
    const { createFairyGuiPageAdapter } = await loadFactory();
    const recording = createRecordingRoot();
    const adapter = createFairyGuiPageAdapter({
      root: recording.root,
      createView: () => ({
        name: "underlying-page",
        dispose: () => {},
        touchable: true,
        width: 300,
        height: 200,
      }),
    });
    adapter.init();
    // 下层页面挂到 system 层仅为验证"同一容器内遮罩遮挡顺序"（业务页面通常
    // 在 normal 层；遮罩 addChild 在页面之后保证遮挡优先）
    const page = adapter.createPage("under", "system", {
      packageName: "ui",
      resName: "Under",
    });
    expect(page.view).toBeDefined();
    adapter.mount(page);

    const system = recording.containers.get("system");
    expect(system).toBeDefined();

    // 模态前：下层页面区域可命中（页面可交互）
    expect(hitTestAt(system as FairyGuiContainerLike, 150, 100)).toBe(page.view);

    // 进入模态：遮罩挂在页面之上（更上层），覆盖区域点击被遮罩拦截
    adapter.setModal(true);
    expect(system?.numChildren).toBe(2);
    const hit = hitTestAt(system as FairyGuiContainerLike, 150, 100);
    // 遮罩位于最上层且可触摸：点击不穿透到下层页面
    expect(isGraphMask(hit)).toBe(true);
    expect(hit).not.toBe(page.view);

    // 模态收敛：遮罩移除，下层页面恢复可交互
    adapter.setModal(false);
    expect(system?.numChildren).toBe(1);
    expect(hitTestAt(system as FairyGuiContainerLike, 150, 100)).toBe(page.view);
  });
});
