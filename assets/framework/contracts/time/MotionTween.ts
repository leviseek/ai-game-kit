import type { PauseDomain } from "./PauseDomain";
import type { TimeSource } from "./TimeSource";

/**
 * 声明式动画选项：timeSource 必填（禁止默认内置 Date.now()，测试注入可控源；
 * 生产经 GameClock 注入使动画可被全局 rate/pause/jump 控制）。
 * 动画器零感知：只读 now(domain) 做插值，不自行乘 rate、不自行判跳变阈值——
 * 倍速/暂停/跳跃语义全部由 timeSource（GameClock）承担。
 */
export interface MotionTweenOptions {
    /** 动画时间源（必填）；经 GameClock 注入时动画跟随全局时间控制。 */
    readonly timeSource: TimeSource;
    /** 动画所属暂停域（默认 Combat：行为/装饰动画绑战斗域）。 */
    readonly domain?: PauseDomain;
    /** 动画时长（ms，时间源读数差）。 */
    readonly durationMs: number;
    /** 每帧回调：progress（0..1 已钳位）+ 当前时间源读数。 */
    readonly onStep: (progress: number, now: number) => void;
    /** 动画完成回调（可选）。 */
    readonly onComplete?: () => void;
}
