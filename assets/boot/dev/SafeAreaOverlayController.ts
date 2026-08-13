/**
 * 安全区虚线框控制器（纯逻辑，引擎无关）：实时读取安全区 inset 与 UI 根容器
 * （GRoot）尺寸，换算为框的矩形坐标；脏检查确保值未变化时不触发视图重绘。
 * 与 DevBallController 同模式——boot/dev 层写可测纯逻辑 + 注入接缝，视图
 * 表现由 Adapter 层实现，本控制器不接触 fgui/cc 类型。
 */

/** 安全区 inset：距 UI 根容器四边的内缩量（GRoot 坐标系）。 */
export interface SafeAreaInset {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
}

/** 安全区框矩形（GRoot 坐标系，与 setRect 回调一致）。 */
export interface SafeAreaRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface SafeAreaOverlayControllerOptions {
    /** 安全区 inset 读取器（GRoot 坐标系）；每次 step 实时调用，勿缓存快照。 */
    readonly readSafeArea: () => SafeAreaInset;
    /** UI 根容器尺寸读取器（GRoot 尺寸）；每次 step 实时调用，勿缓存快照。 */
    readonly readBounds: () => { readonly width: number; readonly height: number };
    /**
     * 表现时间源（GameClock 注入）；本控制器目前不驱动动画，仅保留接缝
     * 供日后扩展（如框闪烁），与 DevBallController 对齐 timeSource 注入模式。
     */
    readonly timeSource: () => number;
    /** 矩形输出回调：值变化时触发（脏检查），视图据此重绘。 */
    readonly onRect: (rect: SafeAreaRect) => void;
    /** 可见性输出回调：仅面板展开时显示，收起时隐藏。 */
    readonly onVisible: (visible: boolean) => void;
}

export interface SafeAreaOverlayController {
    /** 面板展开：显示框并立即重算一次。 */
    show(): void;
    /** 面板收起：隐藏框（保留最后 rect，避免重绘抖动）。 */
    hide(): void;
    /** 每帧推进：实时读取 + 脏检查，值变化才触发 onRect。 */
    step(): void;
    dispose(): void;
}

function sameRect(a: SafeAreaRect, b: SafeAreaRect): boolean {
    return (
        a.x === b.x &&
        a.y === b.y &&
        a.width === b.width &&
        a.height === b.height
    );
}

/** 由 inset 与容器尺寸换算框矩形；inset 全 0（无安全区）时仍返回容器内缩 0 的矩形。 */
export function computeSafeAreaRect(
    inset: SafeAreaInset,
    bounds: { readonly width: number; readonly height: number },
): SafeAreaRect {
    const left = Math.max(0, inset.left);
    const top = Math.max(0, inset.top);
    const right = Math.max(0, inset.right);
    const bottom = Math.max(0, inset.bottom);
    return {
        x: left,
        y: top,
        width: Math.max(0, bounds.width - left - right),
        height: Math.max(0, bounds.height - top - bottom),
    };
}

/**
 * 安全区框控制器：跟随悬浮球信息面板展开/收起显隐，随屏幕缩放/拉伸实时
 * 更新框矩形（每次 step 重读 inset/bounds，防创建时快照）。可见性变化立即
 * 回调；矩形变化经脏检查后回调，值未变不触发无谓重绘。
 */
export function createSafeAreaOverlayController(
    options: SafeAreaOverlayControllerOptions,
): SafeAreaOverlayController {
    const { readSafeArea, readBounds, onRect, onVisible } = options;

    let visible = false;
    let disposed = false;
    let rect: SafeAreaRect = computeSafeAreaRect(
        { left: 0, top: 0, right: 0, bottom: 0 },
        { width: 0, height: 0 },
    );

    function refresh(): void {
        const next = computeSafeAreaRect(readSafeArea(), readBounds());
        if (!sameRect(rect, next)) {
            rect = next;
            onRect(rect);
        }
    }

    return {
        show(): void {
            if (disposed) {
                return;
            }
            if (!visible) {
                visible = true;
                onVisible(true);
            }
            refresh();
        },
        hide(): void {
            if (disposed) {
                return;
            }
            if (visible) {
                visible = false;
                onVisible(false);
            }
        },
        step(): void {
            if (disposed) {
                return;
            }
            // 仅展开态随屏幕变化更新；收起态静默保留最后 rect，不触发重绘
            if (visible) {
                refresh();
            }
        },
        dispose(): void {
            if (disposed) {
                return;
            }
            disposed = true;
            if (visible) {
                visible = false;
                onVisible(false);
            }
        },
    };
}
