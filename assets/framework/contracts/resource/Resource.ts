/**
 * 引擎无关的资源标识与加载结果契约。handle 是跨模块协作的公共载体：业务持有
 * handle 参与作用域计数，跨模块只依赖 handle 与标识，不直接传递引擎 Asset 类型。
 */

/** 资源类型维度，为 FairyGUI package 预留的键空间维度。 */
export type ResourceKind = "asset" | "fairygui-package";

/** 资源标识：类型 + 归属 Bundle + 路径。 */
export interface ResourceKey {
    readonly kind: ResourceKind;
    readonly bundle: string;
    readonly path: string;
}

export type ResourceLoadState = "loading" | "ready" | "failed" | "cancelled";

/** 加载结果 handle：携带资源标识、加载状态与已解析的底层资源。 */
export interface ResourceHandle<T = unknown> {
    readonly key: ResourceKey;
    readonly state: ResourceLoadState;
    readonly resource: T | undefined;
    readonly error: unknown;
    /**
     * 加载落定（ready/failed）或 handle 被取消后，以 handle 自身 resolve。
     * 从不 reject；读取 `state` 与 `error` 判断结果，不要使用 try/catch。
     */
    readonly done: Promise<ResourceHandle<T>>;
    /**
     * 将该等待者从共享加载中分离（detach）。幂等（idempotent），仅在 handle
     * 仍处于 loading 时生效；不影响其他等待者。
     */
    cancel(): void;
}
