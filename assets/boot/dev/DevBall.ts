import type { ViewModelNode } from "../../framework";
import {
    createMotionTween,
    easeOutCubic,
    type MotionTween,
} from "../../framework/core/time/MotionTween";
import type { DevInfoSampler } from "./DevInfo";

/**
 * 悬浮球状态机：collapsed（收缩贴边）→ dragging（按住拖动，吸附暂停）→
 * snapping（释放贴边插值）→ expanded（展开信息面板）。expanded 经悬停/点击
 * 进入，经点击/悬停离开回到 collapsed。动画全部 TS 驱动（禁 transition），
 * 动画器只读注入的 timeSource.now()（对齐 ADR-029）；贴边吸附复用 framework
 * 动画能力层（MotionTween + easeOutCubic），避免线性插值看起来掉帧。
 */
export type DevBallState = "collapsed" | "dragging" | "snapping" | "expanded";

export interface XY {
    readonly x: number;
    readonly y: number;
}

/** FGUI 组件节点名约定：fgui-designer 创建的 XML 必须与这些名字对齐。
 *  ball/panel 契约源在 framework（DevOverlayNodes），此处 import + re-export
 *  保持 boot 消费方与测试导入路径不变。 */
import {
    DEV_BALL_NODE as BALL_NODE,
    DEV_PANEL_NODE as PANEL_NODE,
} from "../../framework/adapters/cocos/ui/DevOverlayNodes";
export { DEV_BALL_NODE as BALL_NODE, DEV_PANEL_NODE as PANEL_NODE } from "../../framework/adapters/cocos/ui/DevOverlayNodes";
export const BADGE_FPS_NODE = "badge_fps";
export const INFO_UPTIME_NODE = "info_uptime";
export const INFO_DEVICE_NODE = "info_device";
export const INFO_NETWORK_NODE = "info_network";
export const INFO_FPS_NODE = "info_fps";
export const INFO_MEMORY_NODE = "info_memory";
/** 贴边吸附动画时长（ms）。 */
export const SNAP_DURATION_MS = 300;
/** 面板淡入/淡出时长（ms）。 */
export const FADE_DURATION_MS = 180;
/** 收缩态 FPS 徽标 / 展开态全量信息的最低刷新间隔（ms）。 */
export const REFRESH_MS = 500;
/** 判定为"轻点"（非拖动）的最大位移（px）。 */
export const TAP_THRESHOLD = 8;

function clamp01(value: number): number {
    return value < 0 ? 0 : value > 1 ? 1 : value;
}

function lerp(from: number, to: number, progress: number): number {
    return from + (to - from) * progress;
}

function lerpXY(from: XY, to: XY, progress: number): XY {
    return { x: lerp(from.x, to.x, progress), y: lerp(from.y, to.y, progress) };
}

/**
 * 贴边目标计算：释放后固定贴回**左侧**边缘（用户确认：球左上角常驻，拖拽是
 * 临时位置调整，最终回到左侧贴边）。球**完整可见**（x=0 贴左，不露头，避免
 * FPS 徽标被屏幕边缘裁掉一半），y 保留拖动结束位置并钳制在设计分辨率边界内。
 * 边界以 UI 根容器（GRoot）尺寸为准，勿用物理像素（design D4）。
 */
export function computeSnapTarget(
    position: XY,
    size: { readonly width: number; readonly height: number },
    bounds: { readonly width: number; readonly height: number },
): XY {
    const clampY = (y: number): number =>
        Math.min(Math.max(0, y), Math.max(0, bounds.height - size.height));
    return { x: 0, y: clampY(position.y) };
}

export interface DevBallOptions {
    /** 节点解析器：球/面板/信息文本按名解析（经 UiHost 视图节点接缝提供）。 */
    readonly node: (name: string) => ViewModelNode | undefined;
    /** 球组件尺寸（GRoot 坐标系），供贴边露头计算。 */
    readonly ballSize: { readonly width: number; readonly height: number };
    /** 实时屏幕边界读取器（GRoot 设计分辨率）；窗口 resize 后取当前值，勿用创建时快照。 */
    readonly readBounds: () => { readonly width: number; readonly height: number };
    /** 表现时间源（GameClock 注入）；动画器只读 now()，不自行乘 rate。 */
    readonly timeSource: () => number;
    /** 信息采样器：收缩态刷新 FPS 徽标，展开态刷新全量信息。 */
    readonly sampler: DevInfoSampler;
    /** 初始球位置（左上角，GRoot 坐标系）；缺省左上角贴左贴顶。 */
    readonly initialPosition?: XY;
    /**
     * 点击（轻点）预留回调：当前不做任何状态处理，仅透传；日后以注册方式
     * 接入 GM 面板（组合根/AppRoot 注入）。缺省无操作。
     */
    readonly onTap?: () => void;
}

export interface DevBallController {
    readonly state: DevBallState;
    /** 触摸/鼠标按住：进入 dragging，记录拖动锚点（吸附暂停）。 */
    onTouchBegin(x: number, y: number): void;
    /** 拖动中：按触点位移更新球位置。 */
    onTouchMove(x: number, y: number): void;
    /** 触摸/鼠标释放：位移超过阈值视为拖动进入贴边吸附，否则为轻点（触发预留 onTap）。 */
    onTouchEnd(): void;
    /** 鼠标悬停进入：收缩态展开信息面板。 */
    onHoverIn(): void;
    /** 鼠标悬停离开：展开态收起信息面板。 */
    onHoverOut(): void;
    /** 每帧推进：吸附/面板插值与低频信息刷新。 */
    step(): void;
    dispose(): void;
}

/**
 * 悬浮球控制器：承载状态机、拖拽贴边与悬停展开/收起动画。交互事件由组合根把
 * fgui 的 TOUCH/ROLL_OVER 桥接到对应方法；点击（轻点）不做状态处理，仅触发
 * 预留的 onTap 回调（日后接入 GM 面板）；信息面板由鼠标悬停展开。
 */
export function createDevBallController(
    options: DevBallOptions,
): DevBallController {
    const { node, ballSize, timeSource, sampler } = options;
    const getBounds = options.readBounds;
    const now = timeSource;

    let state: DevBallState = "collapsed";
    let position: XY =
        options.initialPosition ?? { x: 0, y: 0 };

    // 拖动状态：touching 为触点按下期间；moved 标记位移超过轻点阈值
    let touching = false;
    let moved = false;
    let startTouch: XY = { x: 0, y: 0 };
    let startPosition: XY = { x: 0, y: 0 };
    let stateAtTouchBegin: DevBallState = "collapsed";

    // 进行中动画：吸附（framework MotionTween 缓动插值）与面板（alpha 插值）
    let snapTween: MotionTween | undefined;
    let panelAnim:
        | {
            readonly fromAlpha: number;
            readonly toAlpha: number;
            readonly start: number;
            readonly end: number;
        }
        | undefined;
    // 面板当前 alpha：淡入/淡出以实际值为起点，避免打断后闪回 1 再淡出
    let panelAlpha = 0;
    let lastRefreshAt = Number.NEGATIVE_INFINITY;

    /** 把球位置钳制在设计分辨率边界内（拖动中避免把球拖出屏外丢失）。 */
    function clampToBounds(value: XY): XY {
        const b = getBounds();
        const maxX = Math.max(0, b.width - ballSize.width);
        const maxY = Math.max(0, b.height - ballSize.height);
        return {
            x: Math.min(Math.max(0, value.x), maxX),
            y: Math.min(Math.max(0, value.y), maxY),
        };
    }

    function writeBallXY(value: XY): void {
        node(BALL_NODE)?.setXY?.(value.x, value.y);
    }

    function setPanelVisible(visible: boolean): void {
        node(PANEL_NODE)?.setVisible(visible);
    }

    function setPanelAlpha(value: number): void {
        panelAlpha = clamp01(value);
        node(PANEL_NODE)?.setAlpha?.(panelAlpha);
    }

    function setText(name: string, value: string): void {
        node(name)?.setText(value);
    }

    /** 展开：面板淡入（从当前实际 alpha 起，打断后不闪回）。 */
    function expand(): void {
        if (state === "expanded") {
            return;
        }
        state = "expanded";
        setPanelVisible(true);
        panelAnim = {
            fromAlpha: panelAlpha,
            toAlpha: 1,
            start: now(),
            end: now() + FADE_DURATION_MS,
        };
        refreshExpandedInfo();
    }

    /** 收起：面板淡出后隐藏（从当前实际 alpha 起）。 */
    function collapse(): void {
        if (state === "collapsed") {
            return;
        }
        state = "collapsed";
        panelAnim = {
            fromAlpha: panelAlpha,
            toAlpha: 0,
            start: now(),
            end: now() + FADE_DURATION_MS,
        };
    }

    function refreshBadge(): void {
        const info = sampler.sample();
        setText(
            BADGE_FPS_NODE,
            info.fps === null ? "--" : String(Math.round(info.fps)),
        );
    }

    function refreshExpandedInfo(): void {
        const info = sampler.sample();
        setText(INFO_UPTIME_NODE, info.uptime);
        setText(
            INFO_DEVICE_NODE,
            `${info.platform} / ${info.model} / ${info.language}`,
        );
        setText(
            INFO_NETWORK_NODE,
            `${info.online ? "在线" : "离线"} (${info.networkType})`,
        );
        setText(INFO_FPS_NODE, info.fps === null ? "--" : String(Math.round(info.fps)));
        const memory =
            info.textureMemoryMB === null || info.bufferMemoryMB === null
                ? "--"
                : `tex ${info.textureMemoryMB.toFixed(1)}MB / buf ${info.bufferMemoryMB.toFixed(1)}MB`;
        setText(INFO_MEMORY_NODE, memory);
    }

    writeBallXY(position);
    setPanelVisible(false);

    return {
        get state(): DevBallState {
            return state;
        },

        onTouchBegin(x, y): void {
            if (touching) {
                return;
            }
            touching = true;
            moved = false;
            startTouch = { x, y };
            startPosition = position;
            stateAtTouchBegin = state;
            // 拖动开始即停用吸附：取消进行中的吸附/面板动画
            snapTween = undefined;
            // 面板淡出中被拖拽打断：立即完成隐藏，避免半透明残留（淡入中打断
            // 保持展开语义，拖动结束由 collapse 收尾）
            if (panelAnim !== undefined && panelAnim.toAlpha <= 0) {
                setPanelAlpha(0);
                setPanelVisible(false);
            }
            panelAnim = undefined;
            state = "dragging";
        },

        onTouchMove(x, y): void {
            if (!touching) {
                return;
            }
            const dx = x - startTouch.x;
            const dy = y - startTouch.y;
            if (Math.abs(dx) > TAP_THRESHOLD || Math.abs(dy) > TAP_THRESHOLD) {
                moved = true;
            }
            position = clampToBounds({
                x: startPosition.x + dx,
                y: startPosition.y + dy,
            });
            writeBallXY(position);
        },

        onTouchEnd(): void {
            if (!touching) {
                return;
            }
            touching = false;

            if (!moved) {
                // 轻点：不做任何状态处理，仅触发预留 onTap 回调（日后经注册接入
                // GM 面板）；状态恢复到拖动前（onTouchBegin 已进入 dragging）
                options.onTap?.();
                state = stateAtTouchBegin;
                return;
            }

            // 真实拖动：收起面板（若展开）并回左侧贴边吸附（framework MotionTween
            // easeOutCubic 缓动，避免线性插值看起来掉帧）
            if (state === "expanded" || stateAtTouchBegin === "expanded") {
                collapse();
            }
            const from = position;
            const target = computeSnapTarget(position, ballSize, getBounds());
            snapTween = createMotionTween({
                timeSource: { now: timeSource },
                durationMs: SNAP_DURATION_MS,
                ease: easeOutCubic,
                onStep: (progress) => {
                    position = lerpXY(from, target, progress);
                    writeBallXY(position);
                },
                onComplete: () => {
                    position = target;
                    writeBallXY(position);
                    if (state === "snapping") {
                        state = "collapsed";
                    }
                },
            });
            state = "snapping";
        },

        onHoverIn(): void {
            // 仅收缩态悬停展开；拖动/吸附/已展开时忽略
            if (state === "collapsed") {
                expand();
            }
        },

        onHoverOut(): void {
            if (state === "expanded") {
                collapse();
            }
        },

        step(): void {
            const current = now();

            if (snapTween !== undefined) {
                snapTween.step();
                if (snapTween.completed) {
                    snapTween = undefined;
                }
            }

            if (panelAnim !== undefined) {
                const progress = clamp01((current - panelAnim.start) / (panelAnim.end - panelAnim.start));
                setPanelAlpha(lerp(panelAnim.fromAlpha, panelAnim.toAlpha, progress));
                if (current >= panelAnim.end) {
                    setPanelAlpha(panelAnim.toAlpha);
                    if (panelAnim.toAlpha <= 0) {
                        setPanelVisible(false);
                    }
                    panelAnim = undefined;
                }
            }

            // 低频刷新：收缩态只刷新 FPS 徽标，展开态才全量采样
            if (current - lastRefreshAt >= REFRESH_MS) {
                lastRefreshAt = current;
                if (state === "expanded") {
                    refreshExpandedInfo();
                } else {
                    refreshBadge();
                }
            }
        },

        dispose(): void {
            snapTween = undefined;
            panelAnim = undefined;
            setPanelVisible(false);
        },
    };
}
