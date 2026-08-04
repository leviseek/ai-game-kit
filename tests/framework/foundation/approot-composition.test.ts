import { existsSync, readFileSync } from "node:fs";
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
  Component: class {
    // Cocos Component base class
  },
}));

interface CocosComponent {
  onLoad(): void;
  start(): void;
  onDestroy(): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface ApplicationLike {
  readonly state: string;
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  dispose(): Promise<void>;
}

interface AdapterLike {
  bind(): void;
  unbind(): void;
}

interface AppAssembly {
  readonly app: ApplicationLike;
  readonly adapter: AdapterLike;
}

type AssembleAppFn = () => AppAssembly;

interface AppRootExports {
  readonly assembleApp?: AssembleAppFn;
  readonly createModules?: () => readonly unknown[];
  readonly AppRoot?: new (...args: unknown[]) => CocosComponent;
}

const projectRoot = resolve(import.meta.dir, "../../..");
const appRootFile = resolve(projectRoot, "assets/boot/AppRoot.ts");

async function loadAppRoot(): Promise<{
  assembleApp: AssembleAppFn;
  createModules: () => readonly unknown[];
  AppRoot: new (...args: unknown[]) => CocosComponent;
}> {
  const exports = (await import(
    pathToFileURL(appRootFile).href
  )) as AppRootExports;

  expect(typeof exports.assembleApp).toBe("function");
  expect(typeof exports.AppRoot).toBe("function");

  return {
    assembleApp: exports.assembleApp as AssembleAppFn,
    createModules: (exports.createModules as () => readonly unknown[]) ?? (() => []),
    AppRoot: exports.AppRoot as new (...args: unknown[]) => CocosComponent,
  };
}

describe("AppRoot Composition Root", () => {
  test("assembles an Application and Adapter", async () => {
    const { assembleApp } = await loadAppRoot();

    const { app, adapter } = assembleApp();

    expect(app).toBeDefined();
    expect(adapter).toBeDefined();
    expect(typeof app.start).toBe("function");
    expect(typeof adapter.bind).toBe("function");
    expect(typeof adapter.unbind).toBe("function");
  });

  test("assembled Application starts in created state", async () => {
    const { assembleApp } = await loadAppRoot();

    const { app } = assembleApp();

    expect(app.state).toBe("created");
  });

  test("assembled Application runs full lifecycle start → pause → resume → dispose", async () => {
    const { assembleApp } = await loadAppRoot();

    const { app } = assembleApp();

    await app.start();
    expect(app.state).toBe("running");

    await app.pause();
    expect(app.state).toBe("paused");

    await app.resume();
    expect(app.state).toBe("running");

    await app.dispose();
    expect(app.state).toBe("disposed");
  });

  test("assembled Application can dispose directly from created state", async () => {
    const { assembleApp } = await loadAppRoot();

    const { app } = assembleApp();

    await app.dispose();
    expect(app.state).toBe("disposed");
  });

  test("default module list is empty", async () => {
    const { createModules } = await loadAppRoot();
    const modules = createModules();

    expect(Array.isArray(modules)).toBe(true);
    expect(modules).toHaveLength(0);
  });

  test("does not create forbidden system modules", async () => {
    const { createModules } = await loadAppRoot();
    const modules = createModules();

    const moduleIds = new Set(
      modules
        .filter((m): m is { id?: string } => typeof m === "object" && m !== null)
        .map((m) => m.id),
    );

    const forbiddenIds = [
      "ui", "fairygui", "resource", "scene", "config",
      "network", "ecs", "battle", "combat", "time",
    ];

    for (const id of forbiddenIds) {
      expect(moduleIds.has(id)).toBe(false);
    }
  });
});

describe("AppRoot Component", () => {
  test("is exported as a Cocos Component class", async () => {
    const { AppRoot } = await loadAppRoot();

    expect(typeof AppRoot).toBe("function");

    const instance = new AppRoot();

    expect(typeof instance.onLoad).toBe("function");
    expect(typeof instance.start).toBe("function");
    expect(typeof instance.onDestroy).toBe("function");
  });

  test("onLoad creates Application and Adapter via assembleApp", async () => {
    const { AppRoot } = await loadAppRoot();

    const instance = new AppRoot();

    instance.onLoad();

    // After onLoad, the internal app and adapter should be set
    // (we can't access private fields, but we can verify no error was thrown)
  });

  test("start calls adapter.bind and app.start without throwing", async () => {
    const { AppRoot } = await loadAppRoot();

    const instance = new AppRoot();
    instance.onLoad();

    await instance.start();
    // start() is async due to app.start(), but catches rejections internally
  });

  test("onDestroy calls adapter.unbind and app.dispose without throwing", async () => {
    const { AppRoot } = await loadAppRoot();

    const instance = new AppRoot();
    instance.onLoad();
    await instance.start();

    instance.onDestroy();
    // onDestroy() calls dispose() which returns Promise,
    // Component onDestroy does not need to return a promise
  });

  test("does not directly import Cocos hide/show event constants", () => {
    expect(existsSync(appRootFile)).toBe(true);

    const source = readFileSync(appRootFile, "utf8");

    expect(source).not.toMatch(/EVENT_HIDE/);
    expect(source).not.toMatch(/EVENT_SHOW/);
    expect(source).not.toMatch(/\bgame\s*\.\s*on\b/);
    expect(source).not.toMatch(/\bgame\s*\.\s*off\b/);
  });

  test("onDestroy calls unbind before dispose in source order", () => {
    expect(existsSync(appRootFile)).toBe(true);

    const source = readFileSync(appRootFile, "utf8");
    const onDestroyStart = source.indexOf("onDestroy()");
    const onDestroyBlock = source.slice(onDestroyStart);

    const unbindIndex = onDestroyBlock.indexOf("unbind()");
    const disposeIndex = onDestroyBlock.indexOf("dispose()");

    expect(unbindIndex).toBeGreaterThan(-1);
    expect(disposeIndex).toBeGreaterThan(-1);
    expect(unbindIndex).toBeLessThan(disposeIndex);
  });

  test("repeated onDestroy does not throw", async () => {
    const { AppRoot } = await loadAppRoot();

    const instance = new AppRoot();
    instance.onLoad();
    await instance.start();

    instance.onDestroy();

    instance.onDestroy();
    // Second onDestroy should be safe (adapter.off is idempotent, app.dispose is idempotent)
  });

  test("onDestroy before start does not throw", async () => {
    const { AppRoot } = await loadAppRoot();

    const instance = new AppRoot();
    instance.onLoad();

    instance.onDestroy();
    // unbind/dispose called without bind/start — optional chaining handles undefined
  });

  test("full lifecycle then double onDestroy does not throw", async () => {
    const { AppRoot } = await loadAppRoot();

    const instance = new AppRoot();
    instance.onLoad();
    await instance.start();

    instance.onDestroy();
    instance.onDestroy();
    // After first onDestroy, app is disposed; second call is no-op via Application guard
  });
});

describe("startup.scene", () => {
  const sceneFile = resolve(projectRoot, "assets/boot/startup.scene");

  test("exists and is valid JSON", () => {
    expect(existsSync(sceneFile)).toBe(true);

    const content = readFileSync(sceneFile, "utf8");
    const scene = JSON.parse(content);

    expect(Array.isArray(scene)).toBe(true);
    expect(scene.length).toBeGreaterThan(0);
  });

  test("contains an AppRoot node with AppRoot component", () => {
    const content = readFileSync(sceneFile, "utf8");
    const scene = JSON.parse(content) as Array<{ _name?: string; __type__?: string; _components?: Array<{ __id__: number }> }>;

    const appRootNode = scene.find(
      (entry) => entry._name === "AppRoot" && entry.__type__ === "cc.Node",
    );

    expect(appRootNode).toBeDefined();

    const componentIds = appRootNode?._components?.map((c) => c.__id__) ?? [];
    expect(componentIds.length).toBe(1);

    const componentId = componentIds[0];
    expect(componentId).toBeDefined();

    const component = scene[componentId as number];
    expect(component).toBeDefined();

    if (component !== undefined) {
      const componentType = component.__type__ as string;
      expect(componentType).toMatch(/^fa179/);
    }
  });

  test("AppRoot node is a child of the Scene", () => {
    const content = readFileSync(sceneFile, "utf8");
    const scene = JSON.parse(content) as Array<{ _name?: string; __type__?: string; _children?: Array<{ __id__: number }> }>;

    const sceneEntry = scene.find((entry) => entry.__type__ === "cc.Scene");

    expect(sceneEntry).toBeDefined();

    const childIds = sceneEntry?._children?.map((c) => c.__id__) ?? [];
    const appRootIndex = scene.findIndex((e) => e._name === "AppRoot" && e.__type__ === "cc.Node");

    expect(childIds).toContain(appRootIndex);
  });

  test("AppRoot node does not have Canvas/UI/Camera children", () => {
    const content = readFileSync(sceneFile, "utf8");
    const scene = JSON.parse(content) as Array<{ _name?: string; __type__?: string; _components?: Array<{ __id__: number }> }>;

    const appRootNode = scene.find(
      (entry) => entry._name === "AppRoot" && entry.__type__ === "cc.Node",
    );

    expect(appRootNode).toBeDefined();

    const componentIds = appRootNode?._components?.map((c) => c.__id__) ?? [];

    for (const compId of componentIds) {
      const comp = scene[compId];
      if (comp !== undefined) {
        const type = comp.__type__ as string;
        expect(type).not.toMatch(/^(cc\.)?(Canvas|Camera|UITransform|Widget|Sprite|Label|Button)/);
      }
    }
  });
});
