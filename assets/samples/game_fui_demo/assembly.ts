import { defineFuiViewBinding, type FuiViewBindingRegistrar, type Store } from "../../framework";
import { UiDemoCloseDialog } from "../../ui/generated/ui-demo";
import { CloseDialog } from "./view/CloseDialog";
import { createCloseDialogStore, type CloseDialogAction, type CloseDialogState } from "./store";

/**
 * CloseDialog Application facade：Use Case 端口。confirm/cancel 执行外部 effect，
 * effect 由 Feature assembly 参数注入。View 依赖类型只含 Store 与 facade
 * （见 fui-view-binding spec：网络/存储/资源端口与匿名业务回调不进入 View）。
 */
export interface CloseDialogApplication {
    confirm(): void;
    cancel(): void;
}

/** 外部 effect 注入面：组合期注入，facade 经此执行副作用（不进入 View 面）。 */
export interface CloseDialogEffects {
    readonly confirm: () => void;
    readonly cancel: () => void;
}

/** Feature handle：暴露 Feature 级 Store；dispose 先注销 registration 再释放 Store，幂等。 */
export interface CloseDialogFeature {
    readonly store: Store<CloseDialogState, CloseDialogAction>;
    dispose(): void;
}

/**
 * 装配 CloseDialog Feature（品类 Module 形态的唯一装配入口）：创建 Feature 级
 * Store 与 facade，向组合根 registrar 注册「URL → CloseDialog → binder」。
 *
 * 所有权边界：Store 归 Feature（页面关闭不影响）；页面 scope 只拥有 View 订阅等
 * 页面局部句柄（View.bind 内部 __own 订阅，随页面 dispose 逆序释放）。
 * `dispose()` 先注销 registration 再 dispose Store，重复调用幂等。
 */
export function createCloseDialogFeature(registrar: FuiViewBindingRegistrar, effects: CloseDialogEffects): CloseDialogFeature {
    const store = createCloseDialogStore();
    const application: CloseDialogApplication = {
        confirm: () => effects.confirm(),
        cancel: () => effects.cancel(),
    };
    const registration = registrar.register(
        defineFuiViewBinding(UiDemoCloseDialog, CloseDialog, (view) => {
            view.bind({ store, application });
        }),
    );
    let disposed = false;
    return {
        store,
        dispose() {
            if (disposed) {
                return;
            }
            disposed = true;
            registration.dispose();
            store.dispose();
        },
    };
}
