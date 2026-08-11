import type { MotionTweenOptions } from "../../contracts/time/MotionTween";

/**
 * 缓动曲线：输入线性进度（0..1），输出缓动后的插值进度。纯函数、幂等。
 * framework 动画能力层（ADR-029 声明式动画形态）的一部分，供动画器插值使用。
 */
export type EaseCurve = (progress: number) => number;

/** easeOutQuad：起步快、收尾缓，适合位移入场/回位。 */
export function easeOutQuad(progress: number): number {
    return 1 - (1 - progress) * (1 - progress);
}

/** easeOutCubic：收尾比 Quad 更缓，适合贴边吸附停靠。 */
export function easeOutCubic(progress: number): number {
    return 1 - Math.pow(1 - progress, 3);
}

export interface MotionTweenRuntimeOptions extends MotionTweenOptions {
    /** 缓动曲线：输入 0..1 线性进度，输出插值进度；缺省 easeOutQuad。 */
    readonly ease?: EaseCurve;
}

export interface MotionTween {
    /** 推进一次插值（只读注入 timeSource.now()，动画器零感知）。返回是否仍进行中。 */
    step(): boolean;
    /** 是否已完成（onComplete 已触发）。 */
    readonly completed: boolean;
}

/**
 * 声明式动画运行时：按 MotionTween 契约推进插值。动画器只读注入的 now() 做
 * 进度换算并交给缓动曲线，不自行乘 rate、不判跳变阈值（ADR-029 C-11/C-20）。
 * 本实现不进 framework 白名单，由 boot/dev 等装配层深层导入使用。
 */
export function createMotionTween(options: MotionTweenRuntimeOptions): MotionTween {
    const ease = options.ease ?? easeOutQuad;
    // 起点在创建时记录：动画从"创建时刻"计时，首次 step 前流逝的时间计入进度
    const start = options.timeSource.now();
    let done = false;

    return {
        get completed(): boolean {
            return done;
        },
        step(): boolean {
            if (done) {
                return false;
            }
            const now = options.timeSource.now();
            const raw = (now - start) / options.durationMs;
            const progress = raw >= 1 ? 1 : raw <= 0 ? 0 : raw;
            options.onStep(ease(progress), now);
            if (raw >= 1) {
                done = true;
                options.onComplete?.();
            }
            return !done;
        },
    };
}
