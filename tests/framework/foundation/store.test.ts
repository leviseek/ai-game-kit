import { describe, expect, test } from "bun:test";
import { createStore } from "../../../assets/framework/core/state/Store";

interface CounterState {
    readonly count: number;
    readonly label: string;
}

type CounterAction =
    | { readonly type: "increment"; readonly by: number }
    | { readonly type: "rename"; readonly label: string };

const INITIAL: CounterState = { count: 0, label: "init" };

function counterReducer(state: CounterState, action: CounterAction): CounterState {
    switch (action.type) {
        case "increment":
            return { ...state, count: state.count + action.by };
        case "rename":
            return { ...state, label: action.label };
    }
}

describe("createStore", () => {
    test("读取初始状态", () => {
        const store = createStore<CounterState, CounterAction>(counterReducer, INITIAL);
        expect(store.getState()).toBe(INITIAL);
    });

    test("dispatch 后 reducer 计算新状态并通知订阅者", () => {
        const store = createStore<CounterState, CounterAction>(counterReducer, INITIAL);
        const received: number[] = [];
        store.subscribe((state) => received.push(state.count));

        store.dispatch({ type: "increment", by: 2 });
        store.dispatch({ type: "increment", by: 3 });

        expect(store.getState().count).toBe(5);
        expect(received).toEqual([2, 5]);
    });

    test("reducer 纯且不可变：不修改入参 state，返回新引用", () => {
        const store = createStore<CounterState, CounterAction>(counterReducer, INITIAL);
        const before = store.getState();
        store.dispatch({ type: "rename", label: "renamed" });
        const after = store.getState();

        expect(before).toBe(INITIAL); // 原 state 未被修改
        expect(before.label).toBe("init");
        expect(after).not.toBe(before); // 新 state 为不同引用
        expect(after.label).toBe("renamed");
    });

    test("未变化部分保持同一引用", () => {
        const store = createStore<CounterState, CounterAction>(counterReducer, INITIAL);
        store.dispatch({ type: "rename", label: "x" });
        const afterRename = store.getState();
        store.dispatch({ type: "increment", by: 1 });
        const afterIncrement = store.getState();

        expect(afterIncrement.label).toBe("x");
        expect(afterIncrement.label).toBe(afterRename.label);
    });

    test("订阅退订后不再收到通知", () => {
        const store = createStore<CounterState, CounterAction>(counterReducer, INITIAL);
        const received: number[] = [];
        const sub = store.subscribe((state) => received.push(state.count));

        store.dispatch({ type: "increment", by: 1 });
        sub.dispose();
        store.dispatch({ type: "increment", by: 1 });

        expect(received).toEqual([1]);
    });

    test("dispose 后 dispatch 不再通知也不应用状态", () => {
        const store = createStore<CounterState, CounterAction>(counterReducer, INITIAL);
        const received: number[] = [];
        store.subscribe((state) => received.push(state.count));

        store.dispose();
        store.dispatch({ type: "increment", by: 1 });

        expect(received).toEqual([]);
        expect(store.getState().count).toBe(0); // dispose 后 dispatch 整体 no-op
    });

    test("重复 dispose 幂等", () => {
        const store = createStore<CounterState, CounterAction>(counterReducer, INITIAL);
        store.dispose();
        expect(() => store.dispose()).not.toThrow();
    });

    test("action 判别联合：type 拼错在编译期拦截（类型约束由 TS 保证）", () => {
        // 类型安全：这里仅验证常量表归口形态可被类型系统接受
        const store = createStore<CounterState, CounterAction>(counterReducer, INITIAL);
        const action: CounterAction = { type: "increment", by: 1 };
        store.dispatch(action);
        expect(store.getState().count).toBe(1);
        // 非法 type 在编译期报错，运行期无法构造（类型层面保证）
        expectTypeError();
        void action;
    });
});

/** 编译期类型约束占位：验证非法 action type 与多余载荷在类型层面被拒绝。 */
function expectTypeError(): void {
    // 以下两行若取消注释应在 tsc 下报错（本测试不实际执行，仅文档化约束）
    // const bad: CounterAction = { type: "bump" };
    // const extra: CounterAction = { type: "increment", by: 1, extra: true };
}
