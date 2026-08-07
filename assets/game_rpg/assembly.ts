import type {
  IResourceProvider,
  InputSample,
  InputSource,
  Module,
  PlatformStorage,
  SceneFlow,
  UiNavigator,
} from "../framework";
import {
  createInputMapper,
  createResourceProvider,
  createSceneFlow,
  createUiNavigator,
} from "../framework";
import {
  createGameFixture,
  type GameFixture,
} from "../game/fixture/GameFixture";
import type { RpgAction } from "./models";
import { createRpgInputSource, createRpgInputModule } from "./input";
import { createRpgResourceModule } from "./resource";
import { createRpgSave, createRpgSaveModule } from "./save";
import { createRpgSceneModule } from "./scene";
import { createRpgStateModule, createRpgStateStore } from "./state";
import { createRpgUiModule } from "./ui";

/**
 * RPG 组合夹具的注入选项：测试可注入受控替身驱动协作行为；
 * 缺省项由夹具内部以引擎无关实现兜底，不依赖 cc/fgui。
 */
export interface RpgFixtureOptions {
  /** 资源提供者：缺省为内存资源提供者；观察跨场景资源按作用域释放。 */
  readonly provider?: IResourceProvider;
  /** 平台存储后端：缺省为内存存储；观察版本化存档写入/读取。 */
  readonly storage?: PlatformStorage;
  /** 场景激活接缝：缺省为记录型实现；驱动真实场景切换。 */
  readonly activateScene?: (sceneId: string) => Promise<void>;
  /** 底层输入源：缺省为可控输入源（测试经 fixture.input.push 注入事件）。 */
  readonly inputSource?: InputSource;
}

/** RPG 组合夹具：在 GameFixture 生命周期接缝之上暴露各能力钩子。 */
export interface RpgFixture extends GameFixture {
  /** 跨场景玩家状态：写入后可在场景切换间恢复。 */
  readonly playerState: {
    get(): { sceneId: string; level: number; gold: number } | null;
    set(state: { sceneId: string; level: number; gold: number }): void;
  };
  /** 场景流转：驱动跨场景切换并观察资源作用域释放。 */
  readonly sceneFlow: SceneFlow;
  /** UI 导航器：route 打开/关闭。 */
  readonly navigator: UiNavigator;
  /** 输入上下文：切换激活上下文并路由类型化 action 采样。 */
  readonly input: {
    readonly activeContext: string;
    setActiveContext(context: string): void;
    push(sourceId: string, pressed: boolean, value?: number): void;
    readonly samples: readonly InputSample<RpgAction>[];
  };
  /** 版本化存档：玩家状态可版本化往返。 */
  readonly storage: {
    readonly currentVersion: number;
    save(namespace: string, key: string, data: unknown): Promise<void>;
    load(
      namespace: string,
      key: string,
    ): Promise<{ version: number; data: unknown } | null>;
  };
}

/** 缺省内存平台存储：实现 PlatformStorage，供测试与非 Cocos 环境使用。 */
class MemoryStorage implements PlatformStorage {
  private readonly entries = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.entries.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.entries.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }
}

function createDefaultProvider(): IResourceProvider {
  return createResourceProvider({
    loader: async (key) => key,
    unloadBundle: () => {},
  });
}

/** 缺省记录型场景激活接缝：记录激活的场景 id，不触发真实引擎切换。 */
function createRecordingActivateScene(activated: string[]): (id: string) => Promise<void> {
  return async (sceneId: string) => {
    activated.push(sceneId);
  };
}

/**
 * RPG 组合夹具装配：显式声明模块清单与资源作用域，构造统一生命周期
 * 接缝，并把各能力钩子暴露给测试驱动。组合逻辑留在游戏层夹具内，
 * AppRoot 只做薄转发（design decision 3/4）。
 */
export function createRpgFixture(
  options: RpgFixtureOptions = {},
): RpgFixture {
  const provider = options.provider ?? createDefaultProvider();
  const storage = options.storage ?? new MemoryStorage();
  const activated: string[] = [];
  const activateScene = options.activateScene ?? createRecordingActivateScene(activated);

  // 跨场景状态持有：闭包持有，场景切换不重建
  const stateStore = createRpgStateStore();

  // 场景流转：跨场景资源按 SceneFlow 内部作用域释放
  const sceneFlow: SceneFlow = createSceneFlow({ provider, activateScene });

  // 品类级资源作用域：暴露于 fixture.scope，dispose 时由资源模块释放
  const scope = provider.createScope();

  // UI 导航器：route 打开/关闭
  const navigator: UiNavigator = createUiNavigator();

  // 输入：可控源 + InputMapper，push 注入事件，samples 记录采样
  const inputHandle = createRpgInputSource();
  const samples: InputSample<RpgAction>[] = [];
  const inputMapper = createInputMapper<RpgAction>({
    timeSource: { now: () => Date.now() },
    activeContext: "gameplay",
    mappings: {
      gameplay: {
        "keyboard.space": "confirm",
        "keyboard.w": "move",
      },
      ui: {},
    },
    source: options.inputSource ?? inputHandle.source,
    onSample: (sample) => {
      samples.push(sample);
    },
  });

  // 版本化存档：基于注入平台存储，自持版本号
  const save = createRpgSave(storage);

  const modules: Module[] = [
    createRpgStateModule(stateStore),
    createRpgSceneModule(sceneFlow),
    createRpgResourceModule(provider, scope),
    createRpgUiModule(navigator),
    createRpgInputModule(inputHandle),
    createRpgSaveModule(save),
  ];

  const base = createGameFixture({
    id: "rpg",
    modules,
    scope,
  });

  return {
    ...base,
    playerState: {
      get: () => stateStore.get(),
      set: (state) => stateStore.set(state),
    },
    sceneFlow,
    navigator,
    input: {
      get activeContext() {
        return inputMapper.activeContext;
      },
      setActiveContext: (context: string) => {
        inputMapper.setActiveContext(context);
      },
      push: (sourceId: string, pressed: boolean, value?: number) => {
        inputHandle.push(sourceId, pressed, value);
      },
      get samples() {
        return samples;
      },
    },
    storage: {
      get currentVersion() {
        return save.currentVersion;
      },
      save: (namespace: string, key: string, data: unknown) =>
        save.save(namespace, key, data),
      load: (namespace: string, key: string) => save.load(namespace, key),
    },
  };
}
