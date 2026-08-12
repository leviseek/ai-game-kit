/**
 * 轻量 Store 数据流契约：不可变 State + 纯 reducer/action + 订阅。
 * 引擎无关，供静态页面经单向数据流同步状态到视图。
 */

/** 动作基型：type 判别字段 + 载荷。禁止裸字符串 type 散落（常量表归口）。 */
export interface Action {
    readonly type: string;
}

/** Store 订阅监听器：state 变更后收到最新状态。 */
export type StoreListener<S> = (state: S) => void;

/**
 * Store 契约：读取/派发/订阅/释放。
 * reducer 为纯函数（不可变更新），dispatch 同步应用并通知订阅者。
 */
export interface Store<S, A extends Action> {
    /** 当前状态（最近一次 dispatch 之后）。 */
    getState(): S;
    /** 派发 action：reducer 计算新状态并通知订阅者。 */
    dispatch(action: A): void;
    /** 订阅状态变更；返回释放句柄，调用后不再收到通知。 */
    subscribe(listener: StoreListener<S>): { dispose(): void };
    /** 释放全部订阅；重复调用幂等；dispose 后 dispatch 不再通知。 */
    dispose(): void;
}
