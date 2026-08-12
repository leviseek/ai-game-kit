import type { EffectNode } from "./EffectAnimator";

/** VS 进场配置：左右双方队长武将名 + 基础坐标 + 动画时长（参数化，供定制）。 */
export interface VsEntranceConfig {
    /** 左侧（敌方）武将信息：name 文本 + baseXY 目标坐标（动画从屏外收敛到该坐标）。 */
    readonly left: { readonly name: string; readonly sideLabel: string; readonly baseXY: { readonly x: number; readonly y: number } };
    /** 右侧（己方）武将信息：同上。 */
    readonly right: { readonly name: string; readonly sideLabel: string; readonly baseXY: { readonly x: number; readonly y: number } };
    /** 入场移动+淡入时长（ms）；定格由 holdMs、淡出由 fadeMs 独立控制。 */
    readonly durationMs: number;
    /** 定格时长（ms）。 */
    readonly holdMs: number;
    /** 淡出时长（ms）。 */
    readonly fadeMs: number;
}

/** VS 进场句柄：驱动节点动画；时间源注入保证测试可控。 */
export interface VsEntranceHandle {
    /** 开始 VS 动画：写入武将名/VS 文本并初始化两侧偏移。 */
    play(): void;
    /** 按当前时间推进插值；结束后整体淡出（alpha=0）。 */
    step(): void;
    /** 是否进行中。 */
    active(): boolean;
    /** 清空并回终态（restart/退出）。 */
    reset(): void;
}

/** VS 屏幕级覆盖层：左右武将从屏外两侧向各自目标坐标入场，中间 VS 大字淡入定格，整体淡出。 */
export function createVsEntranceTemplate(options: {
    node: (name: string) => EffectNode | undefined;
    timeSource: () => number;
    config: VsEntranceConfig;
}): VsEntranceHandle {
    const { node, timeSource, config } = options;
    // 左右武将屏外起始偏移：从各自 baseXY.x 向屏幕外偏移（入场时收敛回 baseXY）
    const SIDE_OFFSET = 640;

    let started = false;
    let playStart = 0;
    let playEnd = 0;
    let fadeStart = 0;
    let fadeEnd = 0;

    function resolve(name: string): EffectNode | undefined {
        return node(name);
    }

    function writeXY(name: string, x: number, y: number): void {
        resolve(name)?.setXY?.(x, y);
    }

    function writeAlpha(name: string, value: number): void {
        const view = resolve(name);
        if (view?.setAlpha !== undefined) {
            view.setAlpha(Math.min(1, Math.max(0, value)));
        }
    }

    function writeText(name: string, value: string): void {
        resolve(name)?.setText?.(value);
    }

    function clamp01(v: number): number {
        return Math.min(1, Math.max(0, v));
    }

    /**
     * easeOutBack 缓动：先快后慢、接近 t=1 时 overshoot 越过目标再回弹收敛。
     * 用于 VS 武将入场（回弹制造"到位后轻微弹一下"的节奏）。
     */
    function easeOutBack(t: number): number {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        const x = t - 1;
        return 1 + c3 * x ** 3 + c1 * x ** 2;
    }

    return {
        play() {
            const now = timeSource();
            started = true;
            playStart = now;
            playEnd = now + config.durationMs;
            fadeStart = playEnd + config.holdMs;
            fadeEnd = fadeStart + config.fadeMs;

            writeText("vs_left", config.left.name);
            writeText("vs_right", config.right.name);
            writeText("vs_badge", "VS");
            // 起点：从各自 baseXY.x 向屏外偏移、alpha 0（VS 大字淡入、武将随移动入场）
            writeXY("vs_left", config.left.baseXY.x - SIDE_OFFSET, config.left.baseXY.y);
            writeXY("vs_right", config.right.baseXY.x + SIDE_OFFSET, config.right.baseXY.y);
            writeAlpha("vs_left", 0);
            writeAlpha("vs_right", 0);
            writeAlpha("vs_badge", 0);
        },
        step() {
            if (!started) {
                return;
            }
            const now = timeSource();
            if (now < playStart) {
                return;
            }
            if (now >= fadeEnd) {
                // 整体淡出结束：终态 alpha=0、active 结束
                writeAlpha("vs_left", 0);
                writeAlpha("vs_right", 0);
                writeAlpha("vs_badge", 0);
                started = false;
                return;
            }
            // 入场阶段：武将从两侧向 baseXY 收敛 + 淡入，VS 大字淡入
            // easeOutBack：先快后慢、临近目标轻微回弹（overshoot 越过 baseXY 再收敛）
            const entranceProgress = clamp01((now - playStart) / config.durationMs);
            const eased = easeOutBack(entranceProgress);
            const leftX = config.left.baseXY.x - SIDE_OFFSET * (1 - eased);
            const rightX = config.right.baseXY.x + SIDE_OFFSET * (1 - eased);
            writeXY("vs_left", leftX, config.left.baseXY.y);
            writeXY("vs_right", rightX, config.right.baseXY.y);
            writeAlpha("vs_left", entranceProgress);
            writeAlpha("vs_right", entranceProgress);
            writeAlpha("vs_badge", entranceProgress);
            // 定格窗口 [playEnd, fadeStart)：入场完成后保持位置与 alpha（无额外写入）
            if (now >= fadeStart) {
                // 淡出：alpha 线性降到 0
                const fadeProgress = clamp01((now - fadeStart) / config.fadeMs);
                writeAlpha("vs_left", 1 - fadeProgress);
                writeAlpha("vs_right", 1 - fadeProgress);
                writeAlpha("vs_badge", 1 - fadeProgress);
            }
        },
        active() {
            return started;
        },
        reset() {
            writeAlpha("vs_left", 0);
            writeAlpha("vs_right", 0);
            writeAlpha("vs_badge", 0);
            started = false;
        },
    };
}
