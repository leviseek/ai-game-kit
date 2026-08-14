import type { IResourceHandle } from "./IResourceHandle";

/**
 * 引擎无关的资源作用域。通过 retain 声明对资源的持有权，release 时释放其
 * 全部持有项；作用域之间相互独立、无父子关系，"从内到外逆序释放"是调用方
 * 的约定顺序。
 */
export interface IResourceScope {
    /**
     * 使本作用域持有该资源。同一作用域对同一资源重复 retain 只计一次（幂等）。
     * 已就绪的 handle 计入全局引用计数；仍在加载中的 handle 在落定 ready 后计入、
     * 在作用域释放时被取消；failed/cancelled 的 handle 持有但不计数（失败隔离）。
     * release 之后再次 retain 为无操作（作用域已不可用，忽略以避免引用泄漏）。
     */
    retain(handle: IResourceHandle): void;

    /** 释放本作用域持有的全部资源。重复调用为无操作（幂等）。 */
    release(): void;
}
