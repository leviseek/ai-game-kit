import type { InputEvent, InputSource } from "../framework";
import type { Module } from "../framework";
import type { RpgAction } from "./models";

/**
 * 输入上下文：组合根创建 InputMapper，按激活上下文把底层输入源事件
 * 路由为类型化 action 采样。模块只登记引用；push 钩子经可控输入源
 * 把测试驱动的事件送入 mapper（见 assembly.ts）。
 */
export interface RpgInputHooks {
  readonly activeContext: string;
  setActiveContext(context: string): void;
  push(sourceId: string, pressed: boolean, value?: number): void;
}

/** 可控输入源：测试经 push 注入底层输入事件，无需真实键盘。 */
export interface RpgInputSource {
  readonly source: InputSource;
  push(sourceId: string, pressed: boolean, value?: number): void;
}

export function createRpgInputSource(): RpgInputSource {
  let listener: ((event: InputEvent) => void) | undefined;

  return {
    source: {
      id: "rpg-input",
      subscribe(next: (event: InputEvent) => void): () => void {
        listener = next;
        return () => {
          listener = undefined;
        };
      },
    },
    push: (sourceId: string, pressed: boolean, value?: number) => {
      listener?.({ sourceId, pressed, value });
    },
  };
}

export function createRpgInputModule(handle: RpgInputSource): Module {
  return {
    id: "rpg.input",
    dependencies: [],
    start: () => {
      // 输入源已就绪；mapper 在组合根创建并订阅该源
      void handle.source.id;
    },
  };
}
