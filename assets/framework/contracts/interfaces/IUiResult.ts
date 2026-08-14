import type { IUiPage } from "./IUiPage";

/** 打开/关闭结果：ok=false 时携带原因，失败不改变导航状态。 */
export interface IUiResult {
    readonly ok: boolean;
    readonly page?: IUiPage;
    readonly reason?: string;
}
