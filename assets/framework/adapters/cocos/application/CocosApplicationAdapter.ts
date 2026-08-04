import { game, Game } from "cc";
import type { Application } from "../../../application/Application";

interface CocosGameInstance {
  on(event: string, callback: () => void, target: unknown): void;
  off(event: string, callback: () => void, target: unknown): void;
}

export class CocosApplicationAdapter {
  private readonly app: Application;
  private readonly gameInstance: CocosGameInstance;

  constructor(app: Application, gameInstance: CocosGameInstance = game) {
    this.app = app;
    this.gameInstance = gameInstance;
  }

  bind(): void {
    this.gameInstance.on(Game.EVENT_HIDE, this.onHide, this);
    this.gameInstance.on(Game.EVENT_SHOW, this.onShow, this);
  }

  unbind(): void {
    this.gameInstance.off(Game.EVENT_HIDE, this.onHide, this);
    this.gameInstance.off(Game.EVENT_SHOW, this.onShow, this);
  }

  private onHide = (): void => {
    this.app.pause().catch(() => {
      // 状态不匹配时 pause 会 reject (ApplicationStateError)
      // Adapter 不处理此错误，日志由 Application 内部管理
    });
  };

  private onShow = (): void => {
    this.app.resume().catch(() => {
      // 状态不匹配时 resume 会 reject (ApplicationStateError)
      // Adapter 不处理此错误，日志由 Application 内部管理
    });
  };
}
