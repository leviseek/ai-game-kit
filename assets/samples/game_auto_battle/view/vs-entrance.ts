import type { EffectNode } from "./effect-animator";

/** VS 进场配置：左右双方队长武将名 + 动画时长（参数化，供定制）。 */
export interface VsEntranceConfig {
    /** 左侧（敌方）武将信息。 */
    readonly left: { readonly name: string; readonly sideLabel: string };
    /** 右侧（己方）武将信息。 */
    readonly right: { readonly name: string; readonly sideLabel: string };
    /** VS 展示总时长（ms，入场+定格，不含淡出）。 */
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

/** VS 屏幕级覆盖层：左右武将从屏外两侧向中心入场，中间 VS 大字淡入定格，整体淡出。 */
export function createVsEntranceTemplate(options: {
    node: (name: string) => EffectNode | undefined;
    timeSource: () => number;
    config: VsEntranceConfig;
}): VsEntranceHandle {
    const { node, timeSource, config } = options;
    // 左右武将屏外起始偏移：left 在屏幕左侧外、right 在右侧外（向中心 x=0 收敛）
    const SIDE_OFFSET = 640;
    const CENTER_Y = 0;

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

    return {
        play() {
            const now = timeSource();
            started = true;
            playStart = now;
            playEnd = now + config.durationMs;
            fadeStart = playEnd;
            fadeEnd = playEnd + config.fadeMs;

            writeText("vs_left", config.left.name);
            writeText("vs_right", config.right.name);
            writeText("vs_badge", "VS");
            // 起点：两侧屏外偏移、alpha 0（VS 大字淡入、武将随移动入场）
            writeXY("vs_left", -SIDE_OFFSET, CENTER_Y);
            writeXY("vs_right", SIDE_OFFSET, CENTER_Y);
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
            // 入场阶段：武将从两侧向中心 + 淡入，VS 大字淡入
            // easeOutCubic：前半程快速入场、临近中心减速（t=0.5 时位移 ±80，收敛到 x=0）
            const entranceProgress = clamp01((now - playStart) / config.durationMs);
            const eased = 1 - (1 - entranceProgress) ** 3;
            const leftX = -SIDE_OFFSET * (1 - eased);
            const rightX = SIDE_OFFSET * (1 - eased);
            writeXY("vs_left", leftX, CENTER_Y);
            writeXY("vs_right", rightX, CENTER_Y);
            writeAlpha("vs_left", entranceProgress);
            writeAlpha("vs_right", entranceProgress);
            writeAlpha("vs_badge", entranceProgress);
            // 定格：入场结束后保持到 fadeStart（无额外写入）
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
