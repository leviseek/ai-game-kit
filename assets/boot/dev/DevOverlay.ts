import type { IViewModelNode } from "../../framework";
import { WallClock } from "../../framework/core/time/WallClock";
import { createCocosDeviceInfo } from "../../framework/adapters/cocos/device/CocosDeviceInfo";
import { createCocosViewportInfo } from "../../framework/adapters/cocos/viewport/CocosViewportInfo";
import { createDevOverlayView } from "../../framework/adapters/cocos/ui/DevOverlayViewHandle";
import type { GRootLike } from "../../framework/adapters/cocos/ui/CocosUiRoot";
import { createDevBallController, type DevBallController } from "./DevBall";
import { createSafeAreaOverlayController, type SafeAreaOverlayController, type SafeAreaInset, type SafeAreaRect } from "./SafeAreaOverlayController";
import { createDevPresentationClock } from "./DevClock";
import { createDevInfoSampler, type DevInfoSampler, type ViewportInfo } from "./DevInfo";
import { sampleProfilerStats } from "../profiler";
import { BUNDLES, PACKAGE_PATHS } from "../constants";

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
    readonly node: (name: string) => IViewModelNode | undefined;
    bindInteraction(handlers: DevOverlayInteractionHandlers): void;
    dispose(): void;
}

/** 安全区视图接缝：虚线框矩形更新与显隐，由 fgui 适配器在 Adapter 边界实现。 */
export interface DevOverlaySafeAreaViewSeam {
    setRect(rect: SafeAreaRect): void;
    setVisible(visible: boolean): void;
    dispose(): void;
}

/** 安全区框装配配置：实时读取安全区 inset 与容器尺寸，随面板展开/收起联动。 */
export interface DevOverlaySafeAreaOptions {
    /** 安全区 inset 读取器（GRoot 坐标系，每次实时调用，勿缓存快照）。 */
    readonly readSafeArea: () => SafeAreaInset;
    /** UI 根容器尺寸读取器（GRoot 尺寸，每次实时调用）。 */
    readonly readBounds: () => { readonly width: number; readonly height: number };
    /** 视图装配：创建虚线框视图；返回 undefined 表示创建失败不显示。 */
    readonly createView: () => DevOverlaySafeAreaViewSeam | undefined;
}

/** UI 根容器（GRoot）：设计分辨率边界 + 挂载/移除能力（复用权威 GRootLike 形状）。 */
export type DevOverlayRoot = GRootLike;

export interface DevOverlayMountOptions {
    /** UI 根容器（GRoot）：设计分辨率边界来源，同时作为幂等键。 */
    readonly root: DevOverlayRoot;
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
    /** 安全区框装配：缺省不显示安全区框。 */
    readonly safeArea?: DevOverlaySafeAreaOptions;
    /** 推进驱动：缺省 16ms 间隔循环调用控制器 step；测试可注入手动驱动。 */
    readonly drive?: (tick: () => void) => { dispose(): void };
}

export interface DevOverlayMountHandle {
    /** 是否实际挂载（dev 关闭或视图创建失败时为 false）。 */
    readonly mounted: boolean;
    /** 释放：停驱动、销毁控制器与视图。幂等。 */
    dispose(): void;
}

// 动画时长（吸附 300ms / 淡入淡出 180ms）需要 >3 帧才能平滑；16ms ≈ 60fps 驱动，
// 保证首帧进度不因驱动间隔过大而跳到 70%（对齐 easeOutCubic 曲线）。
const DEFAULT_DRIVE_INTERVAL_MS = 16;

function defaultDrive(tick: () => void): { dispose(): void } {
    const timer = setInterval(tick, DEFAULT_DRIVE_INTERVAL_MS);
    return {
        dispose(): void {
            clearInterval(timer);
        },
    };
}

// 幂等表：同一 root 重复挂载只创建一次（design D5）。dispose 后移除条目，
// 再次挂载可重建；测试用各自 mock root，互不串扰。注意：root 对象是全局幂等键，
// 跨 AppRoot 实例共享——若两个实例用同一 root，后挂载者 dispose 会释放先挂载
// 者的 overlay（正常仅一个 persistRootNode，此约定记录以免误用）。
const mountedByRoot = new WeakMap<object, DevOverlayMountHandle>();

function createOverlayHandle(key: object, options: DevOverlayMountOptions): DevOverlayMountHandle {
    const view = options.createView();
    if (view === undefined) {
        return { mounted: false, dispose(): void {} };
    }

    // 安全区框：视图创建失败时退化为不显示（undefined），装配仍可挂载
    let safeAreaController: SafeAreaOverlayController | undefined;
    let safeAreaView: DevOverlaySafeAreaViewSeam | undefined;
    if (options.safeArea !== undefined) {
        const safeAreaOptions = options.safeArea;
        safeAreaView = safeAreaOptions.createView();
        if (safeAreaView !== undefined) {
            safeAreaController = createSafeAreaOverlayController({
                readSafeArea: safeAreaOptions.readSafeArea,
                readBounds: safeAreaOptions.readBounds,
                timeSource: options.timeSource,
                onRect: (rect) => safeAreaView?.setRect(rect),
                onVisible: (visible) => safeAreaView?.setVisible(visible),
            });
        }
    }

    const controller: DevBallController = createDevBallController({
        node: view.node,
        ballSize: view.ballSize,
        readBounds: () => ({ width: options.root.width, height: options.root.height }),
        timeSource: options.timeSource,
        sampler: options.sampler,
        onTap: options.onTap,
        // 面板展开/收起联动安全区框显隐：展开显示、收起隐藏
        onExpandChange: (expanded) => {
            if (expanded) {
                safeAreaController?.show();
            } else {
                safeAreaController?.hide();
            }
        },
    });
    // 控制器方法形状即交互桥形状，直接绑定 fgui 事件
    view.bindInteraction(controller);
    const driver = (options.drive ?? defaultDrive)(() => {
        controller.step();
        safeAreaController?.step();
    });

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
            safeAreaController?.dispose();
            safeAreaView?.dispose();
            view.dispose();
        },
    };
}

/**
 * 挂载入口：GRoot 就绪后把 dev overlay 挂到全局 UI 常驻作用域（最上层）。
 * dev 关闭默认不创建（release 无残留）；同一 root 幂等（重复调用只创建一次）；
 * 返回 dispose 句柄供宿主生命周期释放。
 */
export function mountDevOverlay(options: DevOverlayMountOptions): DevOverlayMountHandle {
    if (!options.isDevEnabled()) {
        return { mounted: false, dispose(): void {} };
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

/** 宿主装配入口消费的 UI 根宿主窄接口。 */
export interface DevOverlayHost {
    /** 当前 GRoot；未就绪为 undefined。 */
    readonly root: DevOverlayRoot | undefined;
    /** 加载 FairyGUI 包到全局常驻作用域；返回加载结果标识。 */
    readonly loadPackage: (bundle: string, path: string) => Promise<{ readonly state: string }>;
}

export interface DevOverlayHostSetupOptions {
    /** UI 根宿主（组合根注入 UiHost 窄接口）。 */
    readonly host: DevOverlayHost;
    /** 结构化诊断日志（组合根注入）。 */
    readonly logger: {
        warn(message: string): void;
        error(message: string, context?: unknown, error?: Error): void;
    };
    /** 环境开关：dev 关闭时装配为 no-op。 */
    readonly isDevEnabled: () => boolean;
    /** 点击（轻点）预留回调（日后接入 GM 面板）。 */
    readonly onTap?: () => void;
    /**
     * 视口读取器（组合根注入 Adapter 封装）：实际分辨率采样 + 安全区 inset。
     * 缺省时面板分辨率字段为 null、不显示安全区框。
     */
    readonly viewport?: {
        /** 实际分辨率快照（物理 + 逻辑像素）。 */
        readonly sample: () => ViewportInfo;
        /** 安全区 inset（相对指定容器尺寸的 GRoot 坐标系）。 */
        readonly readSafeAreaInset: (bounds: { readonly width: number; readonly height: number }) => SafeAreaInset;
    };
    /** 安全区框视图工厂（组合根注入 Adapter 句柄）；缺省不显示安全区框。 */
    readonly createSafeAreaView?: () => DevOverlaySafeAreaViewSeam | undefined;
    /** 推进驱动：缺省内部定时器（GameClock 推进 + step）。测试可注入。 */
    readonly drive?: (tick: () => void) => { dispose(): void };
}

export interface DevOverlaySetupHandle {
    /** 是否已实际挂载（dev 关闭/创建失败为 false；GRoot 未就绪时内部重试）。 */
    readonly mounted: boolean;
    /** 取消挂载与重试、释放 overlay。幂等。 */
    dispose(): void;
}

const GRootRetryOptions = { maxAttempts: 20, intervalMs: 100 } as const;

/**
 * 宿主装配入口：把 loadPackage → 信息采样器 → 表现时钟 → 挂载 的组装收敛到
 * dev 模块内部（对齐 SmokeProxy 先例，AppRoot 只保留一行调用 + dispose）。
 * GRoot 未就绪时按 list.ts ensureUiReady 语义延迟重试；异步挂载期间 dispose
 * 会取消（AppRoot 销毁场景不残留）。dev 关闭返回 mounted=false 零开销。
 */
export function setupDevOverlay(options: DevOverlayHostSetupOptions): DevOverlaySetupHandle {
    if (!options.isDevEnabled()) {
        return { mounted: false, dispose(): void {} };
    }

    let disposed = false;
    let attemptCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let handle: DevOverlayMountHandle | undefined;
    let mounted = false;

    function clearRetry(): void {
        if (retryTimer !== undefined) {
            clearTimeout(retryTimer);
            retryTimer = undefined;
        }
    }

    function attempt(): void {
        if (disposed || handle !== undefined) {
            return;
        }
        const root = options.host.root;
        if (root === undefined) {
            // GRoot 未就绪：延迟重试（对齐 game/lobby/list 的 ensureUiReady 语义）
            attemptCount += 1;
            if (attemptCount < GRootRetryOptions.maxAttempts) {
                retryTimer = setTimeout(attempt, GRootRetryOptions.intervalMs);
            } else {
                options.logger.warn("[dev] dev overlay skipped: GRoot not ready");
            }
            return;
        }

        void (async () => {
            try {
                const loadHandle = await options.host.loadPackage(BUNDLES.ui, PACKAGE_PATHS.devOverlay);
                if (disposed) {
                    return;
                }
                if (loadHandle.state !== "ready") {
                    options.logger.warn(`[dev] DevOverlay package load failed: ${loadHandle.state}`);
                    return;
                }
                if (disposed) {
                    return;
                }
                // 墙钟供运行时间采样；GameClock（表现时间）供悬浮球动画插值（ADR-029）
                // viewport 缺省装配 Adapter 读取器（对齐 createCocosDeviceInfo 模式）
                const viewportInfo = options.viewport ?? createCocosViewportInfo();
                const sampler = createDevInfoSampler({
                    clock: new WallClock(),
                    device: createCocosDeviceInfo(),
                    navigator: typeof navigator === "undefined" ? undefined : navigator,
                    perf: sampleProfilerStats,
                    readViewport: viewportInfo.sample,
                    readUiSize: () => ({
                        width: root.width,
                        height: root.height,
                    }),
                });
                const devClock = createDevPresentationClock();
                handle = mountDevOverlay({
                    root,
                    isDevEnabled: options.isDevEnabled,
                    sampler,
                    timeSource: devClock.timeSource,
                    createView: () => createDevOverlayView({ root }),
                    onTap: options.onTap,
                    safeArea:
                        options.createSafeAreaView === undefined
                            ? undefined
                            : {
                                  readSafeArea: () =>
                                      viewportInfo.readSafeAreaInset({
                                          width: root.width,
                                          height: root.height,
                                      }),
                                  readBounds: () => ({
                                      width: root.width,
                                      height: root.height,
                                  }),
                                  createView: options.createSafeAreaView,
                              },
                    drive:
                        options.drive ??
                        ((tick) => {
                            // 每帧用真实墙钟增量推进表现时钟，再推进控制器动画
                            const timer = setInterval(() => {
                                devClock.tick(Date.now());
                                tick();
                            }, DEFAULT_DRIVE_INTERVAL_MS);
                            return { dispose: () => clearInterval(timer) };
                        }),
                });
                mounted = handle.mounted;
            } catch (error) {
                if (!disposed) {
                    options.logger.error("[dev] dev overlay mount failed", undefined, error instanceof Error ? error : undefined);
                }
            }
        })();
    }

    attempt();

    return {
        get mounted(): boolean {
            return mounted;
        },
        dispose(): void {
            if (disposed) {
                return;
            }
            disposed = true;
            clearRetry();
            handle?.dispose();
            handle = undefined;
        },
    };
}
