/**
 * createStore 实现：不可变 State + 纯 reducer + 订阅。
 * reducer 不修改入参 state，返回新 state；订阅者集合为 Set 去重，
 * dispose 清空后 dispatch 为 no-op（不通知也不抛错）。
 */

import type { IAction } from "../../contracts/interfaces/IAction";
import type { IStore } from "../../contracts/interfaces/IStore";
import type { IStoreListener } from "../../contracts/interfaces/IStoreListener";

/**
 * 创建轻量 Store（契约 IStore）。
 * reducer 必须是纯函数：相同 (state, action) 必得相同输出；不得修改入参 state。
 * 初始状态直接作为当前 state，dispatch 前订阅者不可见（首次投影由调用方读取）。
 */
export function createStore<S, A extends IAction>(reducer: (state: S, action: A) => S, initialState: S): IStore<S, A> {
    let state = initialState;
    let disposed = false;
    const listeners = new Set<IStoreListener<S>>();

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
        subscribe(listener: IStoreListener<S>): { dispose(): void } {
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
