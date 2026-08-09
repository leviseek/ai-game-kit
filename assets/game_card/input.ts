import type { InputEvent, InputSource, Module } from "../framework";

/**
 * 输入模块：组合根创建 InputMapper，把底层输入源事件映射为类型化 action
 * 采样，onSample 联动出牌（play-card-* 触发 playCard、end-turn 触发 endTurn）。
 * 模块只登记引用；push 钩子经可控输入源把测试驱动的事件送入 mapper。
 */
export interface CardInputHooks {
    readonly activeContext: string;
    setActiveContext(context: string): void;
    push(sourceId: string, pressed: boolean, value?: number): void;
}

/** 可控输入源：测试经 push 注入底层输入事件，无需真实键盘。 */
export interface CardInputSource {
    readonly source: InputSource;
    push(sourceId: string, pressed: boolean, value?: number): void;
}

export function createCardInputSource(): CardInputSource {
    let listener: ((event: InputEvent) => void) | undefined;

    return {
        source: {
            id: "card-input",
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

export function createCardInputModule(handle: CardInputSource): Module {
    return {
        id: "card.input",
        dependencies: [],
        start: () => {
            // 输入源已就绪；mapper 在组合根创建并订阅该源
            void handle.source.id;
        },
    };
}
