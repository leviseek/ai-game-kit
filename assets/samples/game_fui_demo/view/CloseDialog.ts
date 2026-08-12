import {
    FClick,
    FUIBind,
    FuiView,
    type Store,
} from "../../../framework";
import type {
    CloseDialogNodes,
    ICloseDialog,
} from "../../../ui/generated/ui-demo-types";
import { CloseDialogFields } from "../../../ui/generated/ui-demo-types";
import { UiDemoCloseDialog } from "../../../ui/generated/ui-demo";
import type {
    CloseDialogAction,
    CloseDialogState,
    CloseDialogViewModel,
} from "../store";
import {
    CLOSE_DIALOG_ACTIONS,
    projectCloseDialog,
} from "../store";

/**
 * 演示静态页：经 gen-types 生成的 declaration merging interface（I 前缀形状）提供
 * `_` 字段类型，业务类零手写字段。`interface CloseDialog extends ICloseDialog` 与
 * 类同名合并，使 `this._txt_content` 等获得类型。点击经 @FClick 上行 dispatch，
 * 状态经 Store → project → onState 下行写字段（单向数据流）。
 *
 * 组件经 FuiViewHost 以无参构造创建（包装器模式：注册表只存 ctor），故演示页
 * 自持默认 Store；调用方可用 bind(store, callbacks) 注入替换（对齐 D7 组合根注入）。
 */

// 与类同名合并：把生成接口的 `_` 字段并入本类的实例类型。
// 这是 gen-types 声明的 declaration merging 约定（gen-types spec），
// 接口为空体仅为继承生成形状，故显式豁免 no-empty-object-type 与
// unsafe-declaration-merging 检查。
/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
export interface CloseDialog extends ICloseDialog {
}

@FUIBind(UiDemoCloseDialog, CloseDialogFields, { runtimeBinding: "required" })
export class CloseDialog extends FuiView<CloseDialogState, CloseDialogViewModel> {
    private store?: Store<CloseDialogState, CloseDialogAction>;
    private onConfirm: () => void = () => { };
    private onCancel: () => void = () => { };

    /** 注入 Store 与回调（组合根装配时调用）：订阅 + 首次投影，幂等。 */
    bind(deps: {
        readonly store: Store<CloseDialogState, CloseDialogAction>;
        readonly onConfirm: () => void;
        readonly onCancel: () => void;
    }): void {
        this.store = deps.store;
        this.onConfirm = deps.onConfirm;
        this.onCancel = deps.onCancel;
        this.bindStore(this.store, projectCloseDialog);
    }

    /** 打开：写入内容并投影。 */
    open(content: string): void {
        this.store?.dispatch({ type: CLOSE_DIALOG_ACTIONS.OPEN, content });
    }

    protected onConstruct(): void { }

    protected onState(vm: CloseDialogViewModel): void {
        this._txt_content.setText(vm.content);
        this._txt_title.setText(vm.title);
        // 关闭态隐藏内容（MVP 全量写字段，无字段级 diff）
        this._txt_content.setVisible(vm.content.length > 0);
    }

    @FClick<CloseDialogNodes>("btn_confirm_bg")
    private _handleConfirm(): void {
        this.store?.dispatch({ type: CLOSE_DIALOG_ACTIONS.CONFIRM });
        this.onConfirm();
    }

    @FClick<CloseDialogNodes>("btn_cancel_bg")
    private _handleCancel(): void {
        this.store?.dispatch({ type: CLOSE_DIALOG_ACTIONS.CANCEL });
        this.onCancel();
    }
}
