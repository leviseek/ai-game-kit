import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test, mock } from "bun:test";

mock.module("cc", () => ({
  game: {
    on(_event: string, _callback: () => void, _target: unknown) {},
    off(_event: string, _callback: () => void, _target: unknown) {},
    addPersistRootNode(_node: unknown) {},
  },
  Game: {
    EVENT_HIDE: "game_hide",
    EVENT_SHOW: "game_show",
  },
  _decorator: {
    ccclass(_name: string) {
      return <TFunction extends (...args: unknown[]) => unknown>(target: TFunction): TFunction =>
        target;
    },
  },
  Component: class {},
}));

// AppRoot 经 createCocosUiRoot 工厂间接依赖 fairygui-cc；测试不加载真实运行时，
// mock 忠实模拟真实语义：GRoot.inst 未 create 时抛错，GRoot.create 返回实例。
// 为兼容全量运行下 fairy-gui-page-adapter 值导入的符号，mock 同时提供 GComponent/UIPackage。
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

interface ApplicationLike {
  readonly state: string;
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  dispose(): Promise<void>;
}

type ApplicationConstructor = new (
  modules: readonly unknown[],
  context: { readonly logger: unknown; readonly state: string },
) => ApplicationLike;

interface AdapterLike {
  bind(): void;
  unbind(): void;
}

type AdapterConstructor = new (
  app: ApplicationLike,
  gameInstance: {
    on(event: string, callback: () => void, target: unknown): void;
    off(event: string, callback: () => void, target: unknown): void;
  },
) => AdapterLike;

const projectRoot = resolve(import.meta.dir, "../../..");

const frameworkEntry = resolve(projectRoot, "assets/framework/index.ts");
const contextImplFile = resolve(
  projectRoot,
  "assets/framework/application/ApplicationContext.ts",
);
const adapterFile = resolve(
  projectRoot,
  "assets/framework/adapters/cocos/application/CocosApplicationAdapter.ts",
);
const appRootFile = resolve(projectRoot, "assets/boot/AppRoot.ts");

async function loadTestAssembly(): Promise<{
  assembleSmokeApp: () => {
    app: ApplicationLike;
    adapter: AdapterLike;
    gameMock: {
      onCalls: Array<[string, () => void]>;
      trigger(event: string): void;
    };
  };
}> {
  const framework = (await import(
    pathToFileURL(frameworkEntry).href
  )) as { Application?: ApplicationConstructor };

  const contextModule = (await import(
    pathToFileURL(contextImplFile).href
  )) as {
    createApplicationContext?: (
      logger: { info(_msg: string, _ctx?: Record<string, unknown>): void },
    ) => { readonly logger: unknown; readonly state: string };
  };

  const adapterModule = (await import(
    pathToFileURL(adapterFile).href
  )) as { CocosApplicationAdapter?: AdapterConstructor };

  expect(typeof framework.Application).toBe("function");
  expect(typeof contextModule.createApplicationContext).toBe("function");
  expect(typeof adapterModule.CocosApplicationAdapter).toBe("function");

  const Application = framework.Application as ApplicationConstructor;
  const createApplicationContext =
    contextModule.createApplicationContext as NonNullable<
      typeof contextModule.createApplicationContext
    >;
  const CocosAdapter =
    adapterModule.CocosApplicationAdapter as AdapterConstructor;

  return {
    assembleSmokeApp: () => {
      const onCalls: Array<[string, () => void]> = [];
      const listeners = new Map<string, Array<() => void>>();

      const gameMock = {
        onCalls,
        on(event: string, callback: () => void, _target: unknown) {
          onCalls.push([event, callback]);
          const list = listeners.get(event) ?? [];
          list.push(callback);
          listeners.set(event, list);
        },
        off(event: string, callback: () => void, _target: unknown) {
          const list = listeners.get(event);
          if (list !== undefined) {
            const index = list.indexOf(callback);
            if (index >= 0) list.splice(index, 1);
          }
        },
        trigger(event: string) {
          for (const cb of listeners.get(event) ?? []) {
            cb();
          }
        },
      };

      const logger = {
        info(_msg: string, _ctx?: Record<string, unknown>) {},
        child(_scope: string) {
          return this;
        },
      };

      const context = createApplicationContext(
        logger as unknown as Parameters<typeof createApplicationContext>[0],
      );
      const app = new Application([], context);
      const adapter = new CocosAdapter(app, gameMock);

      return { app, adapter, gameMock };
    },
  };
}

describe("Smoke: AppRoot lifecycle and adapter mapping", () => {
  test("full assembled lifecycle: start → pause → resume → dispose", async () => {
    const { assembleSmokeApp } = await loadTestAssembly();
    const { app, adapter, gameMock } = assembleSmokeApp();

    adapter.bind();
    expect(gameMock.onCalls).toHaveLength(2);
    expect(gameMock.onCalls.map(([event]) => event)).toEqual([
      "game_hide",
      "game_show",
    ]);

    await app.start();
    expect(app.state).toBe("running");

    await app.pause();
    expect(app.state).toBe("paused");

    await app.resume();
    expect(app.state).toBe("running");

    adapter.unbind();
    await app.dispose();
    expect(app.state).toBe("disposed");
  });

  test("adapter hide event maps to Application.pause", async () => {
    const { assembleSmokeApp } = await loadTestAssembly();
    const { app, adapter, gameMock } = assembleSmokeApp();

    adapter.bind();
    await app.start();
    expect(app.state).toBe("running");

    gameMock.trigger("game_hide");

    await new Promise<void>((r) => setTimeout(r, 0));
    expect(app.state).toBe("paused");
  });

  test("adapter show event maps to Application.resume", async () => {
    const { assembleSmokeApp } = await loadTestAssembly();
    const { app, adapter, gameMock } = assembleSmokeApp();

    adapter.bind();
    await app.start();
    expect(app.state).toBe("running");

    gameMock.trigger("game_hide");
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(app.state).toBe("paused");

    gameMock.trigger("game_show");
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(app.state).toBe("running");
  });

  test("adapter hide/show events on unstarted app do not crash", async () => {
    const { assembleSmokeApp } = await loadTestAssembly();
    const { app, adapter, gameMock } = assembleSmokeApp();

    adapter.bind();

    gameMock.trigger("game_hide");

    await new Promise<void>((r) => setTimeout(r, 0));
    expect(app.state).toBe("created");

    gameMock.trigger("game_show");
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(app.state).toBe("created");
  });

  test("AppRoot Component smoke: onLoad → start → onDestroy", async () => {
    const appRootModule = (await import(
      pathToFileURL(appRootFile).href
    )) as {
      assembleApp?: () => { app: ApplicationLike; adapter: AdapterLike };
      AppRoot?: new () => {
        onLoad(): void;
        start(): void;
        onDestroy(): void;
      };
    };

    expect(typeof appRootModule.AppRoot).toBe("function");

    const AppRoot = appRootModule.AppRoot as NonNullable<
      typeof appRootModule.AppRoot
    >;

    const instance = new AppRoot();
    instance.onLoad();
    await instance.start();
    instance.onDestroy();

    // No assertions needed; success = no throw
  });
});
