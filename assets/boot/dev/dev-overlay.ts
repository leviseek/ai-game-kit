import type { ViewModelNode } from "../../framework";
import {
    createDevBallController,
    type DevBallController,
} from "./dev-ball";
import type { DevInfoSampler } from "./dev-info";

/** 交互事件桥：与 fgui 适配器的 DevOverlayView 形状同构（结构匹配）。 */
export interface DevOverlayInteractionHandlers {
    onTouchBegin(x: number, y: number): void;
    onTouchMove(x: number, y: number): void;
    onTouchEnd(): void;
    onHoverIn(): void;
    onHoverOut(): void;
}

/** 视图接缝：球/面板节点解析与交互绑定，由 fgui 适配器在 Adapter 边界实现。 */
export interface DevOverlayViewSeam {
    readonly ballSize: { readonly width: number; readonly height: number };
    readonly node: (name: string) => ViewModelNode | undefined;
    bindInteraction(handlers: DevOverlayInteractionHandlers): void;
    dispose(): void;
}

export interface DevOverlayMountOptions {
    /** UI 根容器（GRoot）：设计分辨率边界来源，同时作为幂等键。 */
    readonly root: { readonly width: number; readonly height: number };
    /** 环境开关：dev 关闭时挂载为 no-op（不创建、零开销）。 */
    readonly isDevEnabled: () => boolean;
    /** 信息采样器。 */
    readonly sampler: DevInfoSampler;
    /** 表现时间源（GameClock 注入）；动画器只读 now()。 */
    readonly timeSource: () => number;
    /** 视图装配：创建球/面板视图并绑定交互；返回 undefined 表示创建失败不挂载。 */
    readonly createView: () => DevOverlayViewSeam | undefined;
    /**
     * 点击（轻点）预留回调：当前 no-op，日后以注册方式接入 GM 面板
     * （组合根/AppRoot 注入）。缺省无操作。
     */
    readonly onTap?: () => void;
    /** 推进驱动：缺省 100ms 间隔循环调用控制器 step；测试可注入手动驱动。 */
    readonly drive?: (tick: () => void) => { dispose(): void };
}

export interface DevOverlayMountHandle {
    /** 是否实际挂载（dev 关闭或视图创建失败时为 false）。 */
    readonly mounted: boolean;
    /** 释放：停驱动、销毁控制器与视图。幂等。 */
    dispose(): void;
}

const DEFAULT_DRIVE_INTERVAL_MS = 100;

function defaultDrive(tick: () => void): { dispose(): void } {
    const timer = setInterval(tick, DEFAULT_DRIVE_INTERVAL_MS);
    return {
        dispose(): void {
            clearInterval(timer);
        },
    };
}

// 幂等表：同一 root 重复挂载只创建一次（design D5）。dispose 后移除条目，
// 再次挂载可重建；测试用各自 mock root，互不串扰。
const mountedByRoot = new WeakMap<object, DevOverlayMountHandle>();

function createOverlayHandle(
    key: object,
    options: DevOverlayMountOptions,
): DevOverlayMountHandle {
    const view = options.createView();
    if (view === undefined) {
        return { mounted: false, dispose(): void { } };
    }

    const controller: DevBallController = createDevBallController({
        node: view.node,
        ballSize: view.ballSize,
        bounds: { width: options.root.width, height: options.root.height },
        timeSource: options.timeSource,
        sampler: options.sampler,
        onTap: options.onTap,
    });
    // 控制器方法形状即交互桥形状，直接绑定 fgui 事件
    view.bindInteraction(controller);
    const driver = (options.drive ?? defaultDrive)(() => controller.step());

    let disposed = false;
    return {
        mounted: true,
        dispose(): void {
            if (disposed) {
                return;
            }
            disposed = true;
            // 先移除幂等表条目，使 dispose 后同 root 可重新挂载
            mountedByRoot.delete(key);
            driver.dispose();
            controller.dispose();
            view.dispose();
        },
    };
}

/**
 * 装配入口：GRoot 就绪后把 dev overlay 挂载到全局 UI 常驻作用域（最上层）。
 * dev 关闭默认不创建（release 无残留）；同一 root 幂等（重复调用只创建一次）；
 * 返回 dispose 句柄供 AppRoot 生命周期释放。
 */
export function mountDevOverlay(options: DevOverlayMountOptions): DevOverlayMountHandle {
    if (!options.isDevEnabled()) {
        return { mounted: false, dispose(): void { } };
    }
    const key = options.root as object;
    const existing = mountedByRoot.get(key);
    if (existing !== undefined) {
        return { mounted: existing.mounted, dispose: () => existing.dispose() };
    }
    const handle = createOverlayHandle(key, options);
    mountedByRoot.set(key, handle);
    return handle;
}
