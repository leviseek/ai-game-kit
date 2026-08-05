import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

import { createFairyGuiMock } from "./helpers/fairygui-mock";

// 实现文件 import "fairygui-cc"，测试不加载真实运行时，只注入 GRoot 接缝。
// bun 的 mock.module 全局共享且首个注册生效，与 cocos-adapter 对 "cc" 的处理一致；
// 统一使用共享 fixture 保证全量运行下其它文件值导入的符号齐全。
mock.module("fairygui-cc", () => createFairyGuiMock());

interface GRootLike {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  addChild(child: unknown): unknown;
  removeChild(child: unknown, dispose?: boolean): unknown;
  removeChildren(beginIndex?: number, endIndex?: number, dispose?: boolean): void;
  getChildAt(index: number): unknown;
  readonly numChildren: number;
}

interface CocosUiRootOptions {
  /** GRoot 获取接缝；缺省使用引擎 GRoot 单例，测试可注入 mock。 */
  readonly getRoot?: () => GRootLike;
}

interface CocosUiRoot {
  /** 初始化入口：获取 GRoot 并进入可用状态；重复调用幂等。 */
  readonly init: () => void;
  /** 是否已初始化。 */
  readonly initialized: boolean;
  /** 已初始化的 GRoot；未初始化时为 undefined。 */
  readonly root: GRootLike | undefined;
}

interface CocosUiRootFactory {
  createCocosUiRoot(options?: CocosUiRootOptions): CocosUiRoot;
}

const projectRoot = resolve(import.meta.dir, "../../..");
const adapterFile = resolve(
  projectRoot,
  "assets/framework/adapters/cocos/ui/CocosUiRoot.ts",
);

async function loadFactory(): Promise<CocosUiRootFactory> {
  const exports = (await import(
    pathToFileURL(adapterFile).href
  )) as Partial<CocosUiRootFactory>;

  expect(typeof exports.createCocosUiRoot).toBe("function");

  return {
    createCocosUiRoot:
      exports.createCocosUiRoot as CocosUiRootFactory["createCocosUiRoot"],
  };
}

interface GRootSeam {
  readonly root: GRootLike;
  readonly calls: number;
  readonly getRoot: () => GRootLike;
}

function createGRootSeam(): GRootSeam {
  let calls = 0;
  const root: GRootLike = {
    name: "GRoot",
    width: 1280,
    height: 720,
    addChild: () => undefined,
    removeChild: () => undefined,
    removeChildren: () => {},
    getChildAt: () => undefined,
    numChildren: 0,
  };

  return {
    root,
    get calls() {
      return calls;
    },
    getRoot: mock(() => {
      calls += 1;
      return root;
    }),
  };
}

describe("CocosUiRoot", () => {
  test("initializes the UI root through the adapter factory", async () => {
    const { createCocosUiRoot } = await loadFactory();
    const seam = createGRootSeam();
    const uiRoot = createCocosUiRoot({ getRoot: seam.getRoot });

    expect(uiRoot.initialized).toBe(false);
    expect(uiRoot.root).toBeUndefined();

    uiRoot.init();

    expect(seam.getRoot).toHaveBeenCalledTimes(1);
    expect(uiRoot.initialized).toBe(true);
    expect(uiRoot.root).toBe(seam.root);
  });

  test("repeated initialization is idempotent and reuses the same root", async () => {
    const { createCocosUiRoot } = await loadFactory();
    const seam = createGRootSeam();
    const uiRoot = createCocosUiRoot({ getRoot: seam.getRoot });

    uiRoot.init();
    uiRoot.init();

    // 第二次 init 不重新获取 GRoot，不产生重复根节点或重复注册
    expect(seam.getRoot).toHaveBeenCalledTimes(1);
    expect(uiRoot.initialized).toBe(true);
    expect(uiRoot.root).toBe(seam.root);
  });

  test("initialization failure is reported and leaves the root uninitialized", async () => {
    const { createCocosUiRoot } = await loadFactory();
    const original = new Error("GRoot not available yet");

    const uiRoot = createCocosUiRoot({
      getRoot: () => {
        throw original;
      },
    });

    expect(() => uiRoot.init()).toThrow(original);
    expect(uiRoot.initialized).toBe(false);
    expect(uiRoot.root).toBeUndefined();
  });

  test("a failed initialization can be retried and then succeed", async () => {
    const { createCocosUiRoot } = await loadFactory();
    const original = new Error("engine not ready");
    let attempts = 0;
    const seam = createGRootSeam();

    const uiRoot = createCocosUiRoot({
      getRoot: () => {
        attempts += 1;
        if (attempts === 1) {
          throw original;
        }
        return seam.root;
      },
    });

    expect(() => uiRoot.init()).toThrow(original);
    expect(uiRoot.initialized).toBe(false);

    uiRoot.init();

    expect(uiRoot.initialized).toBe(true);
    expect(uiRoot.root).toBe(seam.root);
  });

  test("a seam that returns undefined counts as not ready and reports failure", async () => {
    const { createCocosUiRoot } = await loadFactory();

    const uiRoot = createCocosUiRoot({
      getRoot: () => undefined,
    });

    expect(() => uiRoot.init()).toThrow(/GRoot is not available/);
    expect(uiRoot.initialized).toBe(false);
    expect(uiRoot.root).toBeUndefined();
  });

  test("defaults to the engine GRoot singleton when no seam is injected", async () => {
    const { createCocosUiRoot } = await loadFactory();

    expect(typeof createCocosUiRoot().init).toBe("function");

    // bun 的 mock.module("fairygui-cc") 无法可靠地在全量运行下观察缺省路径，
    // 改用源码断言锁定"未注入时读取引擎 GRoot 单例"（与 cocos-scene-adapter 一致）。
    const source = readFileSync(adapterFile, "utf8");
    expect(source).toMatch(/GRoot\.(?:inst|create)/);
    expect(source).toMatch(/options\.getRoot\s*\?\?/);
  });
});
