/**
 * createStore 实现：不可变 State + 纯 reducer + 订阅。
 * reducer 不修改入参 state，返回新 state；订阅者集合为 Set 去重，
 * dispose 清空后 dispatch 为 no-op（不通知也不抛错）。
 */

import type { Action, Store, StoreListener } from "../../contracts/state/Store";

/**
 * 创建轻量 Store。
 * reducer 必须是纯函数：相同 (state, action) 必得相同输出；不得修改入参 state。
 * 初始状态直接作为当前 state，dispatch 前订阅者不可见（首次投影由调用方读取）。
 */
export function createStore<S, A extends Action>(reducer: (state: S, action: A) => S, initialState: S): Store<S, A> {
    let state = initialState;
    let disposed = false;
    const listeners = new Set<StoreListener<S>>();

    return {
        getState(): S {
            return state;
        },
        dispatch(action: A): void {
            if (disposed) {
                return;
            }
            state = reducer(state, action);
            for (const listener of Array.from(listeners)) {
                listener(state);
            }
        },
        subscribe(listener: StoreListener<S>): { dispose(): void } {
            listeners.add(listener);
            return {
                dispose(): void {
                    listeners.delete(listener);
                },
            };
        },
        dispose(): void {
            if (disposed) {
                return;
            }
            disposed = true;
            listeners.clear();
        },
    };
}
