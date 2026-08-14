import type { IAction } from "./IAction";
import type { IStoreListener } from "./IStoreListener";

/**
 * Store 契约：读取/派发/订阅/释放。
 * reducer 为纯函数（不可变更新），dispatch 同步应用并通知订阅者。
 */
export interface IStore<S, A extends IAction> {
    /** 当前状态（最近一次 dispatch 之后）。 */
    getState(): S;
    /** 派发 action：reducer 计算新状态并通知订阅者。 */
    dispatch(action: A): void;
    /** 订阅状态变更；返回释放句柄，调用后不再收到通知。 */
    subscribe(listener: IStoreListener<S>): { dispose(): void };
    /** 释放全部订阅；重复调用幂等；dispose 后 dispatch 不再通知。 */
    dispose(): void;
}
