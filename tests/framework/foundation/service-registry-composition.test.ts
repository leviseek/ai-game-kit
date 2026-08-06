import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test, mock } from "bun:test";

import {
  createServiceToken,
  type ServiceRegistry,
} from "../../../assets/framework";
import { createFairyGuiMock } from "./helpers/fairygui-mock";

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
// 统一使用共享 fixture（bun mock.module 全局共享首个生效，保证全量运行符号齐全）。
mock.module("fairygui-cc", () => createFairyGuiMock());

interface AppAssembly {
  readonly registry?: ServiceRegistry;
}

type AssembleAppFn = () => AppAssembly;

const projectRoot = resolve(import.meta.dir, "../../..");
const appRootFile = resolve(projectRoot, "assets/boot/AppRoot.ts");

async function loadAppRoot(): Promise<{ assembleApp: AssembleAppFn }> {
  const exports = (await import(pathToFileURL(appRootFile).href)) as {
    assembleApp?: AssembleAppFn;
  };

  expect(typeof exports.assembleApp).toBe("function");
  return { assembleApp: exports.assembleApp as AssembleAppFn };
}

interface GreeterService {
  readonly greet: (name: string) => string;
}

// 业务对象只依赖服务契约：服务经构造显式注入，不访问注册表或 ApplicationContext。
class GreetingController {
  private readonly greeter: GreeterService;

  constructor(greeter: GreeterService) {
    this.greeter = greeter;
  }

  greet(name: string): string {
    return this.greeter.greet(name);
  }
}

describe("service registry composition root", () => {
  test("assembleApp exposes a registry created by the composition root", async () => {
    const { assembleApp } = await loadAppRoot();

    const { registry } = assembleApp();

    expect(registry).toBeDefined();
    expect(typeof registry?.register).toBe("function");
    expect(typeof registry?.registerFactory).toBe("function");
    expect(typeof registry?.resolve).toBe("function");
    expect(typeof registry?.isRegistered).toBe("function");
  });

  test("each assembleApp creates an independent registry, not a global singleton", async () => {
    const { assembleApp } = await loadAppRoot();

    const first = assembleApp();
    const second = assembleApp();

    expect(first.registry).toBeDefined();
    expect(second.registry).toBeDefined();
    expect(first.registry).not.toBe(second.registry);
  });

  test("business object receives a service via constructor, not registry or context", async () => {
    const { assembleApp } = await loadAppRoot();

    const { registry } = assembleApp();
    expect(registry).toBeDefined();

    const greeterToken = createServiceToken<GreeterService>("greeter");
    const greeter: GreeterService = { greet: (name) => `hello ${name}` };
    registry?.register(greeterToken, greeter);

    // 组合根把已解析服务经构造显式注入业务对象
    const controller = new GreetingController(
      registry?.resolve(greeterToken) as GreeterService,
    );

    expect(controller.greet("levi")).toBe("hello levi");
  });
});
