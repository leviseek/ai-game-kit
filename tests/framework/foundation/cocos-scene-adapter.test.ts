import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

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

  test("uses the engine default director when none is injected", async () => {
    const { createCocosSceneAdapter } = await loadFactory();

    const adapter = createCocosSceneAdapter();

    expect(typeof adapter.activateScene).toBe("function");
  });
});
