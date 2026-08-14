import type { IInputEvent, IInputSource, IInputSourceId, IModule } from "../../../framework";

/**
 * 输入模块：组合根创建 InputMapper，把底层输入源事件映射为类型化 action
 * 采样，onSample 联动出牌（play-card-* 触发 playCard、end-turn 触发 endTurn）。
 * 模块只登记引用；push 钩子经可控输入源把测试驱动的事件送入 mapper。
 */
// branded 来源 id 无运行期值：把业务字符串收窄为品牌类型
function toSourceId(sourceId: string): IInputSourceId {
    return sourceId as unknown as IInputSourceId;
}

export interface CardInputHooks {
    readonly activeContext: string;
    setActiveContext(context: string): void;
    push(sourceId: string, pressed: boolean, value?: number): void;
}

/** 可控输入源：测试经 push 注入底层输入事件，无需真实键盘。 */
export interface CardInputSource {
    readonly source: IInputSource;
    push(sourceId: string, pressed: boolean, value?: number): void;
}

export function createCardInputSource(): CardInputSource {
    let listener: ((event: IInputEvent) => void) | undefined;

    return {
        source: {
            id: toSourceId("card-input"),
            subscribe(next: (event: IInputEvent) => void): () => void {
                listener = next;
                return () => {
                    listener = undefined;
                };
            },
        },
        push: (sourceId: string, pressed: boolean, value?: number) => {
            listener?.({ sourceId: toSourceId(sourceId), pressed, value });
        },
    };
}

export function createCardInputModule(handle: CardInputSource): IModule {
    return {
        id: "card.input",
        dependencies: [],
        start: () => {
            // 输入源已就绪；mapper 在组合根创建并订阅该源
            void handle.source.id;
        },
    };
}
