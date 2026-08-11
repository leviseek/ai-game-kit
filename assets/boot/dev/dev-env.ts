export interface IsDevEnabledOptions {
    /** debug 构建标志（组合根注入 Cocos cc/env 的 DEBUG 宏）；纯 TS 测试注入固定值。 */
    readonly ccDebug: boolean;
    /** 当前 URL 查询串（组合根注入 window.location.search）；非浏览器环境为空串。 */
    readonly search: string;
}

export type IsDevEnabled = () => boolean;

/**
 * 环境开关工厂：debug 构建宏（ccDebug）为主，URL `?dev=0` 强制关闭、`?dev=1`
 * 强制开启；非法参数（非 0/1）不抛错回退默认。组合根注入 `cc.env` 的 DEBUG 宏
 * 与 window.location.search，测试注入固定值（cc 宏在非 Cocos 环境不可用，
 * 见 design D2）。
 */
export function createIsDevEnabled(options: IsDevEnabledOptions): IsDevEnabled {
    // URL 参数强制覆盖：?dev=1 开启、?dev=0 关闭；缺失或非法值保持未定义
    let forced: boolean | undefined;
    const params = new URLSearchParams(options.search);
    const raw = params.get("dev");
    if (raw === "0") {
        forced = false;
    } else if (raw === "1") {
        forced = true;
    }
    return () => forced ?? options.ccDebug;
}
