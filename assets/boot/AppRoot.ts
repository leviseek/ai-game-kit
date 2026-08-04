import { _decorator, Component, game } from "cc";
import { Application } from "../framework";
import type { Module } from "../framework";
import { createApplicationContext } from "../framework/application/ApplicationContext";
import { ConsoleLogger } from "../framework/diagnostics/logging/ConsoleLogger";
import { CocosApplicationAdapter } from "../framework/adapters/cocos/application/CocosApplicationAdapter";

const { ccclass } = _decorator;

export function createModules(): readonly Module[] {
  return [];
}

export interface AppAssembly {
  readonly app: Application;
  readonly adapter: CocosApplicationAdapter;
}

export function assembleApp(): AppAssembly {
  const logger = new ConsoleLogger();
  const context = createApplicationContext(logger);
  const modules = createModules();
  const app = new Application(modules, context);
  const adapter = new CocosApplicationAdapter(app);

  return { app, adapter };
}

@ccclass("AppRoot")
export class AppRoot extends Component {
  private app?: Application;
  private adapter?: CocosApplicationAdapter;

  onLoad(): void {
    const { app, adapter } = assembleApp();
    this.app = app;
    this.adapter = adapter;
    game.addPersistRootNode(this.node);
  }

  start(): void {
    this.adapter?.bind();
    this.app?.start().catch(() => {
      // 启动失败已由 Application 内部通过 context.logger 记录
    });
  }

  onDestroy(): void {
    this.adapter?.unbind();
    this.app?.dispose().catch(() => {
      // dispose 失败已由 Application 内部通过 context.logger 记录
    });
  }
}
