import {
    createStore,
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
