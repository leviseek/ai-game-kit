import type { HitFeedbackEffect } from "./effects";

/** 特效节点接缝：动画器只消费 alpha/xy 写入，与渲染器绑定分离。 */
export interface EffectNode {
    setText?(value: string): void;
    setAlpha?(value: number): void;
    setXY?(x: number, y: number): void;
}

/** 飘字动画参数：时长、上升高度、起始/终态透明度。 */
const FLOAT_DURATION_MS = 600;
const FLOAT_RISE = 24;
/** 闪白动画参数：alpha 0→1→0 的峰值时刻比例。 */
const FLASH_DURATION_MS = 120;
const FLASH_PEAK = 0.5;
/** 抖动动画参数：峰值偏移像素。 */
const SHAKE_OFFSET = 4;
/** 位移动画参数：move 插值时长；入场淡入时长（与 presenter 入场阶段一致）；入场上浮高度。 */
const MOVE_DURATION_MS = 300;
const ENTRANCE_DURATION_MS = 750;
const ENTRANCE_RISE = 80;

/** 进行中的单个动画：按开始时间与时长插值 alpha/xy。 */
interface ActiveAnimation {
    readonly kind: "float" | "flash" | "shake" | "move" | "teleport" | "entrance";
    readonly unitId: string;
    readonly start: number;
    readonly end: number;
    /** 飘字数值（float 用）。 */
    readonly value?: number;
    /** 单位绝对坐标基准（shake 用）：抖动偏移叠加在其上，终态回到该值。 */
    readonly base?: { readonly x: number; readonly y: number };
    /** 位移起点/终点坐标（move 用）：from→to 插值。 */
    readonly fromXY?: { readonly x: number; readonly y: number };
    readonly toXY?: { readonly x: number; readonly y: number };
}

/** 动画器句柄：消费特效意图并驱动节点；时间源注入保证测试可控。 */
export interface AutoBattleEffectAnimator {
    /** 记录待播特效并初始化节点中间态；同单位新特效覆盖旧动画（节点复用）。 */
    play(effects: readonly HitFeedbackEffect[]): void;
    /** 按当前时间推进一次插值并回写节点；动画结束回到终态（alpha=0、坐标归位）。 */
    step(): void;
    /** 进行中动画数（测试断言动画生命周期）。 */
    active(): number;
    /** 清空全部进行中动画并回写终态（restart 时调用，避免旧对局动画残留）。 */
    reset(): void;
}

/** 节点名解析失败时的无害占位：不写任何节点（容错对齐契约）。 */
function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

/** 线性插值。 */
function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}

/**
 * 命中反馈与位移动画器：TS 驱动的飘字/闪白/抖动/位移/入场，不经渲染器绑定
 * （动画中间帧不进入 state diff）。时间源为注入的毫秒时间戳函数；测试注入
 * 自增源确定性推进。
 * - 飘字：`fx_float_{unitId}` 文本上浮 + 淡出（alpha 1→0）
 * - 闪白：`fx_flash_{unitId}` 遮罩 alpha 0→1→0 短促闪烁
 * - 抖动：`unit_{unitId}` 以 `homeXYOf` 提供的绝对坐标（gridToXY 派生的 state
 *   坐标）为基准短促偏移，终态回到该坐标
 * - 移动（move 事件）：`unit_{unitId}` 从 `gridXYOf(from)` 到 `gridXYOf(to)` 插值
 * - 瞬移（teleport 事件）：直接跳变到 `gridXYOf(to)`
 * - 入场（round-start 首轮）：`unit_{unitId}` 从当前位置淡入到位（alpha 0→1）
 * 飘字/闪白/抖动/位移终态统一回到 state 快照姿态（alpha 或坐标对齐 state）。
 */
export function createEffectAnimator(options: {
    node: (name: string) => EffectNode | undefined;
    timeSource: () => number;
    /** 单位绝对坐标来源：presenter 注入从 state 按 unitId 查 gridToXY。 */
    homeXYOf: (unitId: string) => { readonly x: number; readonly y: number };
    /** 网格格 → 屏幕坐标：move/teleport 的 from/to 坐标派生。 */
    gridXYOf: (gridKey: string) => { readonly x: number; readonly y: number };
}): AutoBattleEffectAnimator {
    const { node, timeSource, homeXYOf, gridXYOf } = options;
    const activeAnimations: ActiveAnimation[] = [];

    function resolve(name: string): EffectNode | undefined {
        const view = node(name);
        return view === undefined ? undefined : view;
    }

    function writeAlpha(name: string, value: number): void {
        const view = resolve(name);
        if (view?.setAlpha !== undefined) {
            view.setAlpha(clamp01(value));
        }
    }

    function writeXY(name: string, x: number, y: number): void {
        const view = resolve(name);
        view?.setXY?.(x, y);
    }

    function writeText(name: string, value: string): void {
        const view = resolve(name);
        view?.setText?.(value);
    }

    /** 飘字文本：伤害用鲜红（-value）、治疗用亮绿（+value），UBB 颜色嵌入。 */
    function floatText(kind: "damage" | "heal", value: number): string {
        return kind === "damage"
            ? `[color=#ff5252]-${value}[/color]`
            : `[color=#6fd96f]+${value}[/color]`;
    }

    /** 终止同单位同 kind 的旧动画（新特效覆盖）。 */
    function replace(unitId: string, kind: ActiveAnimation["kind"]): void {
        const index = activeAnimations.findIndex(
            (anim) => anim.unitId === unitId && anim.kind === kind,
        );
        if (index >= 0) {
            activeAnimations.splice(index, 1);
        }
    }

    function play(effects: readonly HitFeedbackEffect[]): void {
        const now = timeSource();
        for (const effect of effects) {
            if (effect.kind === "damage-float" || effect.kind === "heal-float") {
                // 新飘字覆盖同单位旧动画：终止旧的 float，从新时间开始
                replace(effect.unitId, "float");
                activeAnimations.push({
                    kind: "float",
                    unitId: effect.unitId,
                    start: now,
                    end: now + FLOAT_DURATION_MS,
                    value: effect.value,
                });
                const base = homeXYOf(effect.unitId);
                writeText(
                    `fx_float_${effect.unitId}`,
                    floatText(
                        effect.kind === "damage-float" ? "damage" : "heal",
                        effect.value,
                    ),
                );
                writeXY(`fx_float_${effect.unitId}`, base.x, base.y);
                writeAlpha(`fx_float_${effect.unitId}`, 1);
            } else if (effect.kind === "hit-flash") {
                // 闪白遮罩定位到目标单位坐标（组件实例初始位于容器原点，须显式定位）
                const base = homeXYOf(effect.unitId);
                writeXY(`fx_flash_${effect.unitId}`, base.x, base.y);
                activeAnimations.push({
                    kind: "flash",
                    unitId: effect.unitId,
                    start: now,
                    end: now + FLASH_DURATION_MS,
                });
            } else if (effect.kind === "move") {
                // 位移：from→to 网格坐标插值；play 时先定位到 from
                replace(effect.unitId, "move");
                const fromXY = gridXYOf(effect.fromGrid);
                const toXY = gridXYOf(effect.toGrid);
                writeXY(`unit_${effect.unitId}`, fromXY.x, fromXY.y);
                activeAnimations.push({
                    kind: "move",
                    unitId: effect.unitId,
                    start: now,
                    end: now + MOVE_DURATION_MS,
                    fromXY,
                    toXY,
                });
            } else if (effect.kind === "teleport") {
                // 瞬移：即时跳变，play 即完成（无需插值，不加入 activeAnimations）
                replace(effect.unitId, "move");
                const toXY = gridXYOf(effect.toGrid);
                writeXY(`unit_${effect.unitId}`, toXY.x, toXY.y);
            } else if (effect.kind === "entrance") {
                // 入场：单位从布阵格下方上浮到位 + 淡入（alpha 0→1），表现更明显
                replace(effect.unitId, "entrance");
                const base = homeXYOf(effect.unitId);
                writeXY(`unit_${effect.unitId}`, base.x, base.y + ENTRANCE_RISE);
                writeAlpha(`unit_${effect.unitId}`, 0);
                activeAnimations.push({
                    kind: "entrance",
                    unitId: effect.unitId,
                    start: now,
                    end: now + ENTRANCE_DURATION_MS,
                    base,
                });
            }
        }
    }

    function step(): void {
        const now = timeSource();
        for (let index = activeAnimations.length - 1; index >= 0; index -= 1) {
            const anim = activeAnimations[index]!;
            const progress = clamp01((now - anim.start) / (anim.end - anim.start));

            if (anim.kind === "float") {
                // 飘字：以单位绝对坐标为基准，alpha 1→0 淡出，向上位移随进度线性增长
                const base = homeXYOf(anim.unitId);
                writeAlpha(`fx_float_${anim.unitId}`, 1 - progress);
                writeXY(
                    `fx_float_${anim.unitId}`,
                    base.x,
                    base.y - progress * FLOAT_RISE,
                );
            } else if (anim.kind === "flash") {
                // 闪白：alpha 先升后降（峰值在 FLASH_PEAK 处）
                const alpha =
                    progress < FLASH_PEAK
                        ? progress / FLASH_PEAK
                        : (1 - progress) / (1 - FLASH_PEAK);
                writeAlpha(`fx_flash_${anim.unitId}`, alpha);
            } else if (anim.kind === "shake") {
                // 抖动：以单位绝对坐标为基准，xy 在 ±SHAKE_OFFSET 间按正弦摆动
                const base = anim.base ?? homeXYOf(anim.unitId);
                const offset =
                    Math.sin(progress * Math.PI * 2) * SHAKE_OFFSET * (1 - progress);
                writeXY(`unit_${anim.unitId}`, base.x + offset, base.y);
            } else if (anim.kind === "move") {
                // 位移：from→to 网格坐标线性插值
                const from = anim.fromXY ?? homeXYOf(anim.unitId);
                const to = anim.toXY ?? homeXYOf(anim.unitId);
                writeXY(
                    `unit_${anim.unitId}`,
                    lerp(from.x, to.x, progress),
                    lerp(from.y, to.y, progress),
                );
            } else if (anim.kind === "teleport") {
                // 瞬移：直接跳变（end=start，进度恒 1）
                const to = anim.toXY ?? homeXYOf(anim.unitId);
                writeXY(`unit_${anim.unitId}`, to.x, to.y);
            } else if (anim.kind === "entrance") {
                // 入场：从下方上浮到位 + alpha 0→1 淡入
                const base = anim.base ?? homeXYOf(anim.unitId);
                writeXY(
                    `unit_${anim.unitId}`,
                    base.x,
                    base.y + ENTRANCE_RISE * (1 - progress),
                );
                writeAlpha(`unit_${anim.unitId}`, progress);
            }

            if (now >= anim.end) {
                // 终态回位：飘字/闪白 alpha=0；位移/入场对齐 state 坐标与 alpha=1
                if (anim.kind === "float" || anim.kind === "flash") {
                    writeAlpha(
                        anim.kind === "float"
                            ? `fx_float_${anim.unitId}`
                            : `fx_flash_${anim.unitId}`,
                        0,
                    );
                } else if (anim.kind === "shake") {
                    const base = anim.base ?? homeXYOf(anim.unitId);
                    writeXY(`unit_${anim.unitId}`, base.x, base.y);
                } else if (anim.kind === "move" || anim.kind === "teleport") {
                    const to = anim.toXY ?? homeXYOf(anim.unitId);
                    writeXY(`unit_${anim.unitId}`, to.x, to.y);
                } else if (anim.kind === "entrance") {
                    writeAlpha(`unit_${anim.unitId}`, 1);
                }
                activeAnimations.splice(index, 1);
            }
        }
    }

    function reset(): void {
        for (const anim of activeAnimations) {
            if (anim.kind === "float" || anim.kind === "flash") {
                writeAlpha(
                    anim.kind === "float"
                        ? `fx_float_${anim.unitId}`
                        : `fx_flash_${anim.unitId}`,
                    0,
                );
            } else if (anim.kind === "shake") {
                const base = anim.base ?? homeXYOf(anim.unitId);
                writeXY(`unit_${anim.unitId}`, base.x, base.y);
            } else if (anim.kind === "move" || anim.kind === "teleport") {
                const to = anim.toXY ?? homeXYOf(anim.unitId);
                writeXY(`unit_${anim.unitId}`, to.x, to.y);
            } else if (anim.kind === "entrance") {
                writeAlpha(`unit_${anim.unitId}`, 1);
            }
        }
        activeAnimations.length = 0;
    }

    return {
        play,
        step,
        active: () => activeAnimations.length,
        reset,
    };
}
