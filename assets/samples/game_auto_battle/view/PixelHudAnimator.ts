import type { ITimeSource, IViewModelNode } from "../../../framework";

/** 像素扫描线的低强度呼吸范围，避免削弱页面文字对比度。 */
const SCANLINE_BASE_ALPHA = 0.18;
const SCANLINE_ALPHA_AMPLITUDE = 0.06;
const SCANLINE_PERIOD_MS = 1_600;

export interface PixelHudAnimatorOptions {
    readonly timeSource: ITimeSource;
    readonly node: (name: string) => IViewModelNode | undefined;
    readonly scanlineNode: string;
}

export interface PixelHudAnimator {
    step(): void;
    dispose(): void;
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

/**
 * 创建扫描线呼吸动画器。时间相位直接由当前读数计算，显式跳时不会补播历史帧。
 * 未来可在不改变时间语义的前提下扩展其他可选 HUD 视觉通道。
 */
export function createPixelHudAnimator(options: PixelHudAnimatorOptions): PixelHudAnimator {
    let disposed = false;

    return {
        step(): void {
            if (disposed) {
                return;
            }

            const phase = (options.timeSource.now() / SCANLINE_PERIOD_MS) * Math.PI * 2;
            const alpha = clamp01(SCANLINE_BASE_ALPHA + Math.sin(phase) * SCANLINE_ALPHA_AMPLITUDE);
            options.node(options.scanlineNode)?.setAlpha?.(alpha);
        },
        dispose(): void {
            disposed = true;
        },
    };
}
