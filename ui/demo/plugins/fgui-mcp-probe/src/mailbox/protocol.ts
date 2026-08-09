/**
 * 邮箱协议纯函数：不依赖 CS（Puerts）全局，供 server 与 MCP 侧测试复用。
 */

/** handler 返回此标记时，响应由 handler 稍后经 writeResponse 写入（异步操作，如发布等待 onComplete）。 */
export interface DeferredResponse {
    readonly deferred: true;
    readonly id: string;
}

/** 判断 handler 返回值是否为 deferred 标记。 */
export function isDeferredResult(result: unknown): result is DeferredResponse {
    return typeof result === "object" && result !== null && (result as any).deferred === true;
}
