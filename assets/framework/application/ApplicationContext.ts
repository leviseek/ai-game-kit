import type { ILogger } from "../contracts/interfaces/ILogger";
import type { IApplicationContext } from "../contracts/interfaces/IApplicationContext";
import { EnumApplicationState } from "../contracts/enums/EnumApplicationState";

// Symbol 键状态写入器：Application 经 applyApplicationState 反向同步真实状态到
// context，模块侧（IApplicationContext 只读面）不可见不可调用。Symbol 不入
// Object.getOwnPropertyNames，既有的"窄契约无状态修改器"断言保持成立。
const SET_STATE = Symbol("applicationContext.setState");

export function createApplicationContext(logger: ILogger): IApplicationContext {
    let state: EnumApplicationState = EnumApplicationState.Created;

    const context = {
        logger,
        get state(): EnumApplicationState {
            return state;
        },
    };
    Object.defineProperty(context, SET_STATE, {
        value: (next: EnumApplicationState): void => {
            state = next;
        },
        enumerable: false,
        configurable: false,
    });
    return context as IApplicationContext;
}

/**
 * Application 反向写入真实生命周期状态到 context：start/pause/resume/dispose/
 * 回滚每次 setState 时调用，使模块经 context.state 读到与 Application.state
 * 一致的状态。context 未携带写入器（测试 mock / 外部实现）时为 no-op。
 */
export function applyApplicationState(context: IApplicationContext, next: EnumApplicationState): void {
    const setter = (context as unknown as { [SET_STATE]?: (next: EnumApplicationState) => void })[SET_STATE];
    setter?.(next);
}
