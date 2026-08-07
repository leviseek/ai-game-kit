import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";

import type { GameFixture } from "../../../assets/game/fixture/GameFixture";
import { createResourceProvider } from "../../../assets/framework";
import type {
  IResourceProvider,
  InputSample,
  InputSource,
  PlatformStorage,
  SceneFlow,
  UiNavigator,
} from "../../../assets/framework";
import { MemoryPlatform } from "../../../assets/framework/adapters/memory/MemoryPlatform";

const projectRoot = resolve(import.meta.dir, "../../..");
const assemblyFile = resolve(projectRoot, "assets/game_rpg/assembly.ts");
const assemblyExists = existsSync(assemblyFile);
const frameworkRoot = resolve(projectRoot, "assets/framework");

// ---- RPG 夹具目标契约（task 2.1 锁定，task 2.2 实现） ----

interface RpgPlayerState {
  readonly sceneId: string;
  readonly level: number;
  readonly gold: number;
}

/**
 * createRpgFixture 的注入选项：测试注入受控替身驱动协作行为；
 * 缺省项由夹具内部以引擎无关实现兜底，不强制依赖 cc/fgui。
 */
interface RpgFixtureOptions {
  /** 资源提供者：观察跨场景资源按作用域释放。 */
  readonly provider?: IResourceProvider;
  /** 平台存储后端：观察版本化存档写入/读取。 */
  readonly storage?: PlatformStorage;
  /** 场景激活接缝：记录真实场景切换。 */
  readonly activateScene?: (sceneId: string) => Promise<void>;
  /** 底层输入源：注入以推送底层输入事件。 */
  readonly inputSource?: InputSource;
}

/** 夹具暴露的协作钩子：测试驱动跨场景状态、场景流、UI、输入与存档。 */
interface RpgFixtureHooks {
  /** 跨场景玩家状态：写入后在场景切换间保持可读。 */
  readonly playerState: {
    get(): RpgPlayerState | null;
    set(state: RpgPlayerState): void;
  };
  /** 场景流转：驱动场景切换并观察资源作用域释放。 */
  readonly sceneFlow: SceneFlow;
  /** UI 导航器：route/ViewModel 协作。 */
  readonly navigator: UiNavigator;
  /** 输入上下文：切换激活上下文并路由类型化 action 采样。 */
  readonly input: {
    readonly activeContext: string;
    setActiveContext(context: string): void;
    push(sourceId: string, pressed: boolean, value?: number): void;
    readonly samples: readonly InputSample<string>[];
  };
  /** 版本化存档仓库：玩家状态可版本化往返。 */
  readonly storage: {
    readonly currentVersion: number;
    save(namespace: string, key: string, data: unknown): Promise<void>;
    load(
      namespace: string,
      key: string,
    ): Promise<{ version: number; data: unknown } | null>;
  };
}

type RpgFixture = GameFixture & RpgFixtureHooks;
type CreateRpgFixture = (options?: RpgFixtureOptions) => RpgFixture;

async function loadCreateRpgFixture(): Promise<CreateRpgFixture> {
  const mod = (await import(
    pathToFileURL(assemblyFile).href
  )) as { createRpgFixture: CreateRpgFixture };
  return mod.createRpgFixture;
}

// ---- 统一驱动：与 8.6 统一生命周期测试相同的接缝调用顺序 ----

async function driveUniformLifecycle(fixture: GameFixture): Promise<string[]> {
  const steps: string[] = [];
  await fixture.start();
  steps.push("start");
  await fixture.pause();
  steps.push("pause");
  await fixture.resume();
  steps.push("resume");
  await fixture.dispose();
  steps.push("dispose");
  return steps;
}

describe("RPG fixture contract file", () => {
  test("declares createRpgFixture without cc or fgui imports", () => {
    expect(
      existsSync(assemblyFile),
      "assets/game_rpg/assembly.ts not implemented yet (task 2.2)",
    ).toBe(true);

    if (!existsSync(assemblyFile)) {
      return;
    }

    const source = readFileSync(assemblyFile, "utf8");

    expect(source).toMatch(/\bexport\s+(?:function|const)\s+createRpgFixture\b/);
    // 夹具组合层只经框架根入口与游戏层公共装配入口导入（design decision 3）
    expect(source).not.toMatch(/from\s*["']cc(?:["']|\/)/);
    expect(source).not.toMatch(/from\s*["']fairygui/);
  });
});

describe.skipIf(!assemblyExists)(
  "RPG fixture composition capabilities",
  () => {
    test("createRpgFixture returns a GameFixture exposing the uniform lifecycle", async () => {
      const createRpgFixture = await loadCreateRpgFixture();
      const fixture = createRpgFixture();

      expect(fixture.id).toBe("rpg");
      expect(Array.isArray(fixture.modules)).toBe(true);

      for (const seam of [
        "start",
        "pause",
        "resume",
        "failRollback",
        "dispose",
      ] as const) {
        expect(typeof fixture[seam]).toBe("function");
      }

      await expect(driveUniformLifecycle(fixture)).resolves.toEqual([
        "start",
        "pause",
        "resume",
        "dispose",
      ]);
    });

    test("the module list only contains declared capabilities and no audio module", async () => {
      const createRpgFixture = await loadCreateRpgFixture();
      const fixture = createRpgFixture();

      expect(fixture.modules.length).toBeGreaterThan(0);

      const ids = fixture.modules.map((m) => m.id).join(",");
      // 跨场景状态、资源作用域、UI、输入与存档均作为显式模块参与装配
      expect(ids).toMatch(/state|scene/);
      expect(ids).toMatch(/resource|scope/);
      expect(ids).toMatch(/ui|view/);
      expect(ids).toMatch(/input/);
      expect(ids).toMatch(/save|storage/);
      // 未声明能力不参与装配：音频不在 RPG 组合清单内
      expect(ids).not.toMatch(/audio/);
    });

    test("cross-scene player state survives a scene switch and scene A resources are released", async () => {
      const createRpgFixture = await loadCreateRpgFixture();
      const unloaded: string[] = [];
      const activated: string[] = [];

      const provider = createResourceProvider({
        loader: async (key) => key,
        unloadBundle: (bundle: string) => {
          unloaded.push(bundle);
        },
      });
      const activateScene = async (sceneId: string) => {
        activated.push(sceneId);
      };

      const fixture = createRpgFixture({ provider, activateScene });
      await fixture.start();

      // 场景 A：加载场景独有资源并写入玩家状态
      const toA = await fixture.sceneFlow.switchTo("scene-a", {
        bundle: "rpg_a",
        paths: ["a.png"],
      });
      expect(toA.ok).toBe(true);
      fixture.playerState.set({ sceneId: "scene-a", level: 1, gold: 0 });
      expect(provider.canUnload("rpg_a")).toBe(false);

      // 切换到场景 B
      const toB = await fixture.sceneFlow.switchTo("scene-b", {
        bundle: "rpg_b",
        paths: ["b.png"],
      });
      expect(toB.ok).toBe(true);

      // 场景切换后持有状态仍可恢复
      expect(fixture.playerState.get()).toEqual({
        sceneId: "scene-a",
        level: 1,
        gold: 0,
      });

      // 场景 A 独有资源按作用域释放，场景 B 资源被持有
      expect(activated).toEqual(["scene-a", "scene-b"]);
      expect(provider.canUnload("rpg_a")).toBe(true);
      expect(unloaded).toContain("rpg_a");
      expect(provider.canUnload("rpg_b")).toBe(false);

      await fixture.dispose();
    });

    test("UI navigation opens and closes a route through the navigator", async () => {
      const createRpgFixture = await loadCreateRpgFixture();
      const fixture = createRpgFixture();
      await fixture.start();

      const opened = fixture.navigator.open("rpg/status");
      expect(opened.ok).toBe(true);
      expect(fixture.navigator.top?.route).toBe("rpg/status");

      const closed = fixture.navigator.close();
      expect(closed.ok).toBe(true);
      expect(fixture.navigator.top).toBeUndefined();

      await fixture.dispose();
    });

    test("input context routes a pushed event to a typed action sample", async () => {
      const createRpgFixture = await loadCreateRpgFixture();
      const fixture = createRpgFixture();
      await fixture.start();

      expect(typeof fixture.input.activeContext).toBe("string");

      const before = fixture.input.samples.length;
      fixture.input.push("keyboard.space", true);
      fixture.input.push("keyboard.space", false);

      expect(fixture.input.samples.length).toBe(before + 2);
      const pressed = fixture.input.samples[fixture.input.samples.length - 2];
      expect(pressed.pressed).toBe(true);
      expect(typeof pressed.action).toBe("string");
      expect(pressed.action.length).toBeGreaterThan(0);

      // 激活上下文可切换，且切换不产生额外采样
      const current = fixture.input.activeContext;
      fixture.input.setActiveContext(current === "gameplay" ? "ui" : "gameplay");
      expect(fixture.input.samples.length).toBe(before + 2);

      await fixture.dispose();
    });

    test("player state round-trips through the versioned save", async () => {
      const createRpgFixture = await loadCreateRpgFixture();
      const storage = new MemoryPlatform();
      const fixture = createRpgFixture({ storage });
      await fixture.start();

      const state = { sceneId: "scene-a", level: 3, gold: 100 };
      await fixture.storage.save("rpg", "player", state);

      const loaded = await fixture.storage.load("rpg", "player");
      expect(loaded).not.toBeNull();
      expect(loaded?.data).toEqual(state);
      expect(loaded?.version).toBe(fixture.storage.currentVersion);
      expect(fixture.storage.currentVersion).toBeGreaterThanOrEqual(1);

      await fixture.dispose();
    });
  },
);

describe("RPG fixture framework boundary", () => {
  test("the framework layer declares no character/skill/quest models", () => {
    // 负向断言：角色/技能/任务等业务模型只允许存在于游戏层，框架层不出现对应类型声明
    const modelPattern =
      /\b(?:interface|class|type|enum)\s+(?:Character|Skill|Quest|Role|Job|Battle|Deck|Round|Economy|Production|Combo|Hitbox|FrameData|Player)\b/;

    const offenders: string[] = [];
    const collect = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) {
          collect(path);
        } else if (entry.isFile() && path.endsWith(".ts")) {
          const source = readFileSync(path, "utf8");
          if (modelPattern.test(source)) {
            offenders.push(path.replace(`${projectRoot}\\`, ""));
          }
        }
      }
    };

    collect(frameworkRoot);
    expect(offenders).toEqual([]);
  });
});
