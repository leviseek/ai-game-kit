import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

// 注意：bun 在同一进程运行所有测试文件，mock.module("cc") 全局共享且首个注册
// 生效、后续同路径注册被忽略。因此本文件不依赖全局 cc 缺省值做行为断言；
// 缺省 director 路径改用源码断言锁定（与 approot-composition 的源码断言一致）。
mock.module("cc", () => ({
  director: {},
}));

import type { SceneFlowOptions } from "../../../assets/framework/core/scene/SceneFlow";

interface CocosDirectorLike {
  loadScene(
    sceneName: string,
    onLaunched?: (error: Error | null, scene?: unknown) => void,
  ): boolean;
}

interface CocosSceneAdapter {
  readonly activateScene: SceneFlowOptions["activateScene"];
}

interface CocosSceneAdapterFactory {
  createCocosSceneAdapter(options?: {
    readonly director?: CocosDirectorLike;
  }): CocosSceneAdapter;
}

const projectRoot = resolve(import.meta.dir, "../../..");
const adapterFile = resolve(
  projectRoot,
  "assets/framework/adapters/cocos/scene/CocosSceneAdapter.ts",
);

async function loadFactory(): Promise<CocosSceneAdapterFactory> {
  const exports = (await import(
    pathToFileURL(adapterFile).href
  )) as Partial<CocosSceneAdapterFactory>;

  expect(typeof exports.createCocosSceneAdapter).toBe("function");

  return {
    createCocosSceneAdapter:
      exports.createCocosSceneAdapter as CocosSceneAdapterFactory["createCocosSceneAdapter"],
  };
}

interface CocosMockState {
  readonly sceneLoads: readonly string[];
}

interface CocosDirectorMock {
  readonly director: CocosDirectorLike;
  readonly state: CocosMockState;
  launch(): void;
  failLaunch(error: Error): void;
  rejectStart(): void;
}

function createCocosDirectorMock(): CocosDirectorMock {
  const sceneLoads: string[] = [];
  let launched:
    | ((error: Error | null, scene?: unknown) => void)
    | undefined;
  let startResult = true;

  const director: CocosDirectorLike = {
    loadScene(sceneName, onLaunched) {
      sceneLoads.push(sceneName);
      launched = onLaunched;
      return startResult;
    },
  };

  return {
    director,
    state: { sceneLoads },
    launch() {
      launched?.(null, { id: "launched-scene" });
    },
    failLaunch(error) {
      launched?.(error);
    },
    rejectStart() {
      startResult = false;
    },
  };
}

describe("CocosSceneAdapter", () => {
  test("maps an activation request to cc.director.loadScene and resolves on launch", async () => {
    const { createCocosSceneAdapter } = await loadFactory();
    const cocos = createCocosDirectorMock();
    const adapter = createCocosSceneAdapter({ director: cocos.director });

    const activating = adapter.activateScene("scene-b");

    expect(cocos.state.sceneLoads).toEqual(["scene-b"]);

    cocos.launch();
    await activating;
  });

  test("rejects when the director reports a launch error", async () => {
    const { createCocosSceneAdapter } = await loadFactory();
    const cocos = createCocosDirectorMock();
    const adapter = createCocosSceneAdapter({ director: cocos.director });
    const original = new Error("scene launch failed");

    const activating = adapter.activateScene("scene-b");
    cocos.failLaunch(original);

    await expect(activating).rejects.toBe(original);
  });

  test("rejects synchronously when loadScene refuses to start the scene", async () => {
    const { createCocosSceneAdapter } = await loadFactory();
    const cocos = createCocosDirectorMock();
    cocos.rejectStart();
    const adapter = createCocosSceneAdapter({ director: cocos.director });

    const activating = adapter.activateScene("missing-scene");

    await expect(activating).rejects.toThrow(/missing-scene/);
  });

  test("defaults to cc.director when no director is injected", async () => {
    const { createCocosSceneAdapter } = await loadFactory();

    const adapter = createCocosSceneAdapter();

    expect(typeof adapter.activateScene).toBe("function");

    // bun 的 mock.module("cc") 全局共享且首个注册生效，无法在全量运行下可靠地
    // 观察缺省 cc.director 路径；改用源码断言锁定"未注入时读取引擎默认实例"。
    const source = readFileSync(adapterFile, "utf8");
    expect(source).toMatch(/cc\.director/);
    expect(source).toMatch(/options\.director\s*\?\?/);
  });
});
