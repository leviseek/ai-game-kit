import type { IInputEvent, IInputSource, IInputSourceId } from "../../../framework";
import type { IModule } from "../../../framework";

/**
 * 输入上下文：组合根创建 InputMapper，按激活上下文把底层输入源事件
 * 路由为类型化 action 采样。模块只登记引用；push 钩子经可控输入源
 * 把测试驱动的事件送入 mapper（见 assembly.ts）。
 */
// branded 来源 id 无运行期值：把业务字符串收窄为品牌类型
function toSourceId(sourceId: string): IInputSourceId {
    return sourceId as unknown as IInputSourceId;
}

export interface RpgInputHooks {
    readonly activeContext: string;
    setActiveContext(context: string): void;
    push(sourceId: string, pressed: boolean, value?: number): void;
}

/** 可控输入源：测试经 push 注入底层输入事件，无需真实键盘。 */
export interface RpgInputSource {
    readonly source: IInputSource;
    push(sourceId: string, pressed: boolean, value?: number): void;
}

export function createRpgInputSource(): RpgInputSource {
    let listener: ((event: IInputEvent) => void) | undefined;

    return {
        source: {
            id: toSourceId("rpg-input"),
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

export function createRpgInputModule(handle: RpgInputSource): IModule {
    return {
        id: "rpg.input",
        dependencies: [],
        start: () => {
            // 输入源已就绪；mapper 在组合根创建并订阅该源
            void handle.source.id;
        },
    };
}
