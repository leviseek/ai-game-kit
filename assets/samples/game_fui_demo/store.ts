import {
    createStore,
    type Module,
    type Store,
} from "../../framework";

/** 关闭对话框演示状态：可见性 + 内容文案。 */
export interface CloseDialogState {
    readonly visible: boolean;
    readonly content: string;
}

export type CloseDialogAction =
    | { readonly type: "open"; readonly content: string }
    | { readonly type: "confirm" }
    | { readonly type: "cancel" };

/** 关闭对话框演示 reducer：纯函数，不可变更新。 */
export function closeDialogReducer(
    state: CloseDialogState,
    action: CloseDialogAction,
): CloseDialogState {
    switch (action.type) {
        case "open":
            return { visible: true, content: action.content };
        case "confirm":
        case "cancel":
            return { ...state, visible: false };
    }
}

export interface CloseDialogViewModel {
    readonly content: string;
    readonly title: string;
}

/** 投影：Store 状态 → 视图数据（外部纯函数，可独立单测）。 */
export function projectCloseDialog(state: CloseDialogState): CloseDialogViewModel {
    return {
        content: state.visible ? state.content : "",
        title: state.visible ? "确认" : "",
    };
}

/** 创建演示 Store：初始关闭态。 */
export function createCloseDialogStore(): Store<CloseDialogState, CloseDialogAction> {
    return createStore(closeDialogReducer, { visible: false, content: "" });
}

/** 演示动作常量归口：跨模块共享的 action type（进常量表）。 */
export const CLOSE_DIALOG_ACTIONS = {
    OPEN: "open",
    CONFIRM: "confirm",
    CANCEL: "cancel",
} as const;

export interface CloseDialogStoreHandle {
    readonly store: Store<CloseDialogState, CloseDialogAction>;
    /** 打开对话框：写入内容并派发 open。 */
    open(content: string): void;
}

/**
 * 演示 Store 装配（品类 Module 形态）：start 创建 Store，stop 释放（dispose 订阅）。
 * 对齐 D7「组合根注入、非全局单例、随品类模块生命周期」——示范页经 bind(handle)
 * 获得 Store 与投影函数。
 */
export function createCloseDialogStoreModule(): Module & {
    getHandle(): CloseDialogStoreHandle | undefined;
} {
    let handle: CloseDialogStoreHandle | undefined;

    return {
        id: "fui_demo.close_dialog",
        dependencies: [],
        start: () => {
            const store = createCloseDialogStore();
            handle = {
                store,
                open: (content: string) => {
                    store.dispatch({ type: CLOSE_DIALOG_ACTIONS.OPEN, content });
                },
            };
        },
        stop: () => {
            handle?.store.dispose();
            handle = undefined;
        },
        getHandle: () => handle,
    };
}
