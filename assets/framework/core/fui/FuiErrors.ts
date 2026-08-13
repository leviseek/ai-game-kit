/**
 * FUI 错误族：注册/创建/绑定/清理错误集中于本模块，统一继承 FrameworkError
 * 并携带组件/URL 上下文与首个 cause；仅业务方需要识别的 FuiViewCleanupError
 * 进入根公共导出，其余保持内部（见 framework/index.ts）。
 */

import { FrameworkError } from "../errors/FrameworkError";
import type { FuiComponentUrl } from "./FuiComponentRegistry";

/** 组件注册失败：复合键重复登记（fail-fast）。 */
export class FuiComponentRegistrationError extends FrameworkError {
    constructor(url: FuiComponentUrl) {
        super(`Fui component already registered: ${url}`, { component: url });
        this.name = "FuiComponentRegistrationError";
    }
}

/** 视图运行时绑定注册失败：required 组件缺少对应 binder（见 fui-view-binding spec）。 */
export class FuiViewBindingRegistrationError extends FrameworkError {
    constructor(url: FuiComponentUrl, message = `runtime binding missing for ${url}`) {
        super(message, { component: url });
        this.name = "FuiViewBindingRegistrationError";
    }
}

/** 组件创建失败：createObject 返回 null 或 View 构造器抛错（携带原始 cause）。 */
export class FuiViewCreationError extends FrameworkError {
    /** 创建失败回滚期间的清理错误（冻结快照；无原生 AggregateError，见 FuiViewCleanupError）。 */
    readonly cleanupErrors?: readonly unknown[];

    constructor(url: FuiComponentUrl, cause: unknown, cleanupErrors?: readonly unknown[]) {
        super(`Failed to create FuiView for ${url}`, {
            component: url,
            cause,
            recoverable: false,
        });
        this.name = "FuiViewCreationError";
        if (cleanupErrors !== undefined && cleanupErrors.length > 0) {
            this.cleanupErrors = Object.freeze([...cleanupErrors]);
        }
    }
}

/** 绑定 kind：字段注入、点击注册或运行时 binder 的缺失/不匹配分类。 */
export type FuiBindingKind = "field" | "click" | "runtime";

/**
 * 绑定节点缺失/不匹配：seam 在 child()/onClick() 检测到组件无对应元件时抛出
 * （field/click，fail-fast）；runtime 由 binder resolver 在视图 ctor 与
 * 注册 binder 不匹配时抛出。
 */
export class FuiBindingError extends FrameworkError {
    readonly nodeName: string;
    readonly bindingKind: FuiBindingKind;

    constructor(url: FuiComponentUrl, nodeName: string, bindingKind: FuiBindingKind) {
        super(`Fui ${bindingKind} binding missing: ${nodeName} in ${url}`, {
            component: url,
            recoverable: false,
        });
        this.name = "FuiBindingError";
        this.nodeName = nodeName;
        this.bindingKind = bindingKind;
    }
}

/**
 * 清理聚合错误：多步清理逐一尝试，结束时聚合报告全部失败（替代原生 AggregateError，
 * 兼容 foundation ES2015 目标）。errors 为冻结快照，cause 取首个失败便于调用链定位。
 */
export class FuiViewCleanupError extends FrameworkError {
    readonly errors: readonly unknown[];

    constructor(component: string, errors: readonly unknown[]) {
        super("FUI cleanup failed", {
            component,
            cause: errors[0],
            recoverable: false,
        });
        this.name = "FuiViewCleanupError";
        this.errors = Object.freeze([...errors]);
    }
}
