import type { EnumResourceLoadState } from "../enums/EnumResourceLoadState";
import type { IResourceKey } from "./IResourceKey";

/** 加载结果 handle：携带资源标识、加载状态与已解析的底层资源。 */
export interface IResourceHandle<T = unknown> {
    readonly key: IResourceKey;
    readonly state: EnumResourceLoadState;
    readonly resource: T | undefined;
    readonly error: unknown;
    /**
     * 加载落定（ready/failed）或 handle 被取消后，以 handle 自身 resolve。
     * 从不 reject；读取 `state` 与 `error` 判断结果，不要使用 try/catch。
     */
    readonly done: Promise<IResourceHandle<T>>;
    /**
     * 将该等待者从共享加载中分离（detach）。幂等（idempotent），仅在 handle
     * 仍处于 loading 时生效；不影响其他等待者。
     */
    cancel(): void;
}
