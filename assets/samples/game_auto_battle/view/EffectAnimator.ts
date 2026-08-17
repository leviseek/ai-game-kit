import type { HitFeedbackEffect } from "./effects";
import type { AutoBattleEffectAnchor } from "./view";
import {
    ARCANE_IMPACT_FRAME_URLS,
    ARCANE_PROJECTILE_FRAME_URLS,
    EXPLOSION_FRAME_URLS,
    FIREBALL_IMPACT_FRAME_URLS,
    FIREBALL_PROJECTILE_FRAME_URLS,
    HEAL_AURA_FRAME_URLS,
    HOLY_IMPACT_FRAME_URLS,
    HOLY_PROJECTILE_FRAME_URLS,
    PHYSICAL_HIT_FRAME_URLS,
    SHADOW_IMPACT_FRAME_URLS,
    SHADOW_PROJECTILE_FRAME_URLS,
    SLASH_ARC_FRAME_URLS,
    TOTEM_IMPACT_FRAME_URLS,
    TOTEM_PROJECTILE_FRAME_URLS,
} from "./animUrls";

/** 特效节点接缝：动画器只消费 alpha/xy/url 写入，与渲染器绑定分离。 */
export interface EffectNode {
    setText?(value: string): void;
    setAlpha?(value: number): void;
    setXY?(x: number, y: number): void;
    /** 可选图片 URL 写入：loader 序列帧切图（爆炸帧）；未实现时动画器跳过。 */
    setUrl?(value: string): void;
}

/** 飘字动画参数：时长、上升高度、起始/终态透明度。 */
const FLOAT_DURATION_MS = 600;
const FLOAT_RISE = 24;
/** 闪白动画参数：alpha 0→1→0 的峰值时刻比例。 */
const FLASH_DURATION_MS = 120;
const FLASH_PEAK = 0.5;
/** 抖动动画参数：峰值偏移像素。 */
const SHAKE_OFFSET = 4;
/** 位移动画参数：move 插值时长；入场淡入时长（与 presenter 入场阶段一致）。 */
const MOVE_DURATION_MS = 300;
const ENTRANCE_DURATION_MS = 750;
/** 战场画布宽度与中线（1280×720，敌左己右分界）：入场按单位所在半场选走进方向。 */
const SCREEN_WIDTH = 1280;
const SCREEN_CENTER_X = 640;
/** 入场横向偏移：单位从屏幕左右边界外走进布阵位（敌从左、己从右）。 */
const ENTRANCE_FROM_EDGE = 160;
/** 爆炸序列帧参数：每帧展示时长（12 帧总时长约 480ms，短促爆炸）。 */
const EXPLOSION_FRAME_MS = 40;
const PHYSICAL_IMPACT_FRAME_MS = 60;
const HEAL_AURA_FRAME_MS = 80;
const FIREBALL_PROJECTILE_FRAME_MS = 70;
const FIREBALL_IMPACT_FRAME_MS = 60;

/** 进行中的单个动画：按开始时间与时长插值 alpha/xy。 */
interface ActiveAnimation {
    readonly kind: "float" | "flash" | "shake" | "move" | "teleport" | "entrance" | "explosion" | "sequence" | "projectile";
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
    /** 特效帧 URL 序列：逐帧 setUrl。 */
    readonly urls?: readonly string[];
    readonly frameMs?: number;
    /** 投射物飞行阶段帧数；后续帧固定在目标位置播放命中爆发。 */
    readonly projectileFrames?: number;
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
 * 命中反馈与位移动画器：TS 驱动的飘字/闪白/抖动/位移/入场/爆炸，不经渲染器绑定
 * （动画中间帧不进入 state diff）。时间源为注入的毫秒时间戳函数；测试注入
 * 自增源确定性推进。
 * - 飘字：`fx_float_{unitId}` 文本上浮 + 淡出（alpha 1→0）
 * - 闪白：`fx_flash_{unitId}` 遮罩 alpha 0→1→0 短促闪烁
 * - 抖动：`unit_{unitId}` 以 `homeXYOf` 提供的绝对坐标（gridToXY 派生的 state
 *   坐标）为基准短促偏移，终态回到该坐标
 * - 移动（move 事件）：`unit_{unitId}` 从 `gridXYOf(from)` 到 `gridXYOf(to)` 插值
 * - 瞬移（teleport 事件）：直接跳变到 `gridXYOf(to)`
 * - 入场（round-start 首轮）：`unit_{unitId}` 从屏幕左右边界外横向走进布阵位（alpha 0→1）
 * - 爆炸（unit-dead 事件）：`fx_effect_{unitId}` loader 逐帧 setUrl 播放爆炸序列
 * 飘字/闪白/抖动/位移/爆炸终态统一回到 state 快照姿态（alpha 或坐标对齐 state）。
 * 单位形象动画（idle/attack/death 循环）由 UnitAnimator 单独驱动，不经本动画器。
 */
export function createEffectAnimator(options: {
    node: (name: string) => EffectNode | undefined;
    timeSource: () => number;
    /** 单位绝对坐标来源：presenter 注入从 state 按 unitId 查 gridToXY。 */
    homeXYOf: (unitId: string) => { readonly x: number; readonly y: number };
    /** 特效语义锚点：脚底、胸腹或上半身；由 UnitSlot 几何统一换算。 */
    effectXYOf: (unitId: string, anchor: AutoBattleEffectAnchor) => { readonly x: number; readonly y: number };
    /** 网格格 → 屏幕坐标：move/teleport 的 from/to 坐标派生。 */
    gridXYOf: (gridKey: string) => { readonly x: number; readonly y: number };
}): AutoBattleEffectAnimator {
    const { node, timeSource, homeXYOf, effectXYOf, gridXYOf } = options;
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

    function writeUrl(name: string, value: string): void {
        const view = resolve(name);
        view?.setUrl?.(value);
    }

    /** 飘字文本：伤害用鲜红（-value）、治疗用亮绿（+value），UBB 颜色嵌入。 */
    function floatText(kind: "damage" | "heal", value: number): string {
        return kind === "damage" ? `[color=#ff5252]-${value}[/color]` : `[color=#6fd96f]+${value}[/color]`;
    }

    /** 终止同单位同 kind 的旧动画（新特效覆盖）。 */
    function replace(unitId: string, kind: ActiveAnimation["kind"]): void {
        const index = activeAnimations.findIndex((anim) => anim.unitId === unitId && anim.kind === kind);
        if (index >= 0) {
            activeAnimations.splice(index, 1);
        }
    }

    /** 每个目标只有一个 loader_effect；新序列统一替换该目标正在播放的旧序列。 */
    function replaceEffectLane(unitId: string): void {
        for (let index = activeAnimations.length - 1; index >= 0; index -= 1) {
            const anim = activeAnimations[index]!;
            if (anim.unitId === unitId && (anim.kind === "explosion" || anim.kind === "sequence" || anim.kind === "projectile")) {
                activeAnimations.splice(index, 1);
            }
        }
    }

    function projectileUrls(effect: "fireball" | "arcane-bolt" | "shadow-bolt" | "holy-bolt" | "totem-bolt"): { readonly flight: readonly string[]; readonly impact: readonly string[] } {
        if (effect === "arcane-bolt") return { flight: ARCANE_PROJECTILE_FRAME_URLS, impact: ARCANE_IMPACT_FRAME_URLS };
        if (effect === "shadow-bolt") return { flight: SHADOW_PROJECTILE_FRAME_URLS, impact: SHADOW_IMPACT_FRAME_URLS };
        if (effect === "holy-bolt") return { flight: HOLY_PROJECTILE_FRAME_URLS, impact: HOLY_IMPACT_FRAME_URLS };
        if (effect === "totem-bolt") return { flight: TOTEM_PROJECTILE_FRAME_URLS, impact: TOTEM_IMPACT_FRAME_URLS };
        return { flight: FIREBALL_PROJECTILE_FRAME_URLS, impact: FIREBALL_IMPACT_FRAME_URLS };
    }

    function play(effects: readonly HitFeedbackEffect[]): void {
        const now = timeSource();
        for (const effect of effects) {
            if (effect.kind === "damage-float" || effect.kind === "heal-float") {
                // 新飘字覆盖同单位旧动画：终止旧的 float，从新时间开始
                replace(effect.unitId, "float");
                const start = now + (effect.delayMs ?? 0);
                activeAnimations.push({
                    kind: "float",
                    unitId: effect.unitId,
                    start,
                    end: start + FLOAT_DURATION_MS,
                    value: effect.value,
                });
                const base = homeXYOf(effect.unitId);
                writeText(`fx_float_${effect.unitId}`, floatText(effect.kind === "damage-float" ? "damage" : "heal", effect.value));
                writeXY(`fx_float_${effect.unitId}`, base.x, base.y);
                writeAlpha(`fx_float_${effect.unitId}`, effect.delayMs === undefined ? 1 : 0);
            } else if (effect.kind === "hit-flash") {
                // 闪白遮罩定位到目标单位坐标（组件实例初始位于容器原点，须显式定位）
                const base = effectXYOf(effect.unitId, "upper-body");
                writeXY(`fx_flash_${effect.unitId}`, base.x, base.y);
                const start = now + (effect.delayMs ?? 0);
                writeAlpha(`fx_flash_${effect.unitId}`, 0);
                activeAnimations.push({
                    kind: "flash",
                    unitId: effect.unitId,
                    start,
                    end: start + FLASH_DURATION_MS,
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
                // 入场：单位从屏幕左右边界外横向走进布阵位（敌从左、己从右，
                // 方向按目标坐标所在半场派生），伴随淡入；不再从下方上浮
                replace(effect.unitId, "entrance");
                const base = homeXYOf(effect.unitId);
                const fromX = base.x < SCREEN_CENTER_X ? -ENTRANCE_FROM_EDGE : SCREEN_WIDTH + ENTRANCE_FROM_EDGE;
                writeXY(`unit_${effect.unitId}`, fromX, base.y);
                writeAlpha(`unit_${effect.unitId}`, 0);
                activeAnimations.push({
                    kind: "entrance",
                    unitId: effect.unitId,
                    start: now,
                    end: now + ENTRANCE_DURATION_MS,
                    base,
                    fromXY: { x: fromX, y: base.y },
                });
            } else if (effect.kind === "explosion") {
                // 爆炸：定位到目标单位坐标 + 播放首帧 + 淡入；后续 step 逐帧 setUrl
                replaceEffectLane(effect.unitId);
                const base = effectXYOf(effect.unitId, "torso");
                writeXY(`fx_effect_${effect.unitId}`, base.x, base.y);
                writeUrl(`fx_effect_${effect.unitId}`, EXPLOSION_FRAME_URLS[0]!);
                writeAlpha(`fx_effect_${effect.unitId}`, 1);
                activeAnimations.push({
                    kind: "explosion",
                    unitId: effect.unitId,
                    start: now,
                    end: now + EXPLOSION_FRAME_URLS.length * EXPLOSION_FRAME_MS,
                    urls: EXPLOSION_FRAME_URLS,
                    frameMs: EXPLOSION_FRAME_MS,
                });
            } else if (effect.kind === "effect-sequence") {
                replaceEffectLane(effect.unitId);
                const base = effectXYOf(effect.unitId, effect.effect === "heal-aura" ? "feet" : "torso");
                const urls = effect.effect === "physical-impact" ? [...SLASH_ARC_FRAME_URLS, ...PHYSICAL_HIT_FRAME_URLS] : HEAL_AURA_FRAME_URLS;
                const frameMs = effect.effect === "physical-impact" ? PHYSICAL_IMPACT_FRAME_MS : HEAL_AURA_FRAME_MS;
                writeXY(`fx_effect_${effect.unitId}`, base.x, base.y);
                writeUrl(`fx_effect_${effect.unitId}`, urls[0]!);
                writeAlpha(`fx_effect_${effect.unitId}`, 1);
                activeAnimations.push({ kind: "sequence", unitId: effect.unitId, start: now, end: now + urls.length * frameMs, urls, frameMs });
            } else if (effect.kind === "projectile-effect") {
                replaceEffectLane(effect.unitId);
                const fromXY = effectXYOf(effect.sourceId, "upper-body");
                const toXY = effectXYOf(effect.unitId, "upper-body");
                const sequence = projectileUrls(effect.effect);
                const urls = [...sequence.flight, ...sequence.impact];
                const flightMs = sequence.flight.length * FIREBALL_PROJECTILE_FRAME_MS;
                const impactMs = sequence.impact.length * FIREBALL_IMPACT_FRAME_MS;
                writeXY(`fx_effect_${effect.unitId}`, fromXY.x, fromXY.y);
                writeUrl(`fx_effect_${effect.unitId}`, urls[0]!);
                writeAlpha(`fx_effect_${effect.unitId}`, 1);
                activeAnimations.push({
                    kind: "projectile",
                    unitId: effect.unitId,
                    start: now,
                    end: now + flightMs + impactMs,
                    urls,
                    fromXY,
                    toXY,
                    projectileFrames: sequence.flight.length,
                });
            }
        }
    }

    function step(): void {
        const now = timeSource();
        for (let index = activeAnimations.length - 1; index >= 0; index -= 1) {
            const anim = activeAnimations[index]!;
            if (now < anim.start) {
                continue;
            }
            const progress = clamp01((now - anim.start) / (anim.end - anim.start));

            if (anim.kind === "float") {
                // 飘字：以单位绝对坐标为基准，alpha 1→0 淡出，向上位移随进度线性增长
                const base = homeXYOf(anim.unitId);
                writeAlpha(`fx_float_${anim.unitId}`, 1 - progress);
                writeXY(`fx_float_${anim.unitId}`, base.x, base.y - progress * FLOAT_RISE);
            } else if (anim.kind === "flash") {
                // 闪白：alpha 先升后降（峰值在 FLASH_PEAK 处）
                const alpha = progress < FLASH_PEAK ? progress / FLASH_PEAK : (1 - progress) / (1 - FLASH_PEAK);
                writeAlpha(`fx_flash_${anim.unitId}`, alpha);
            } else if (anim.kind === "shake") {
                // 抖动：以单位绝对坐标为基准，xy 在 ±SHAKE_OFFSET 间按正弦摆动
                const base = anim.base ?? homeXYOf(anim.unitId);
                const offset = Math.sin(progress * Math.PI * 2) * SHAKE_OFFSET * (1 - progress);
                writeXY(`unit_${anim.unitId}`, base.x + offset, base.y);
            } else if (anim.kind === "move") {
                // 位移：from→to 网格坐标线性插值
                const from = anim.fromXY ?? homeXYOf(anim.unitId);
                const to = anim.toXY ?? homeXYOf(anim.unitId);
                writeXY(`unit_${anim.unitId}`, lerp(from.x, to.x, progress), lerp(from.y, to.y, progress));
            } else if (anim.kind === "teleport") {
                // 瞬移：直接跳变（end=start，进度恒 1）
                const to = anim.toXY ?? homeXYOf(anim.unitId);
                writeXY(`unit_${anim.unitId}`, to.x, to.y);
            } else if (anim.kind === "entrance") {
                // 入场：从屏幕边界外横向走进布阵位（x 插值）+ alpha 0→1 淡入
                const from = anim.fromXY ?? homeXYOf(anim.unitId);
                const to = anim.base ?? homeXYOf(anim.unitId);
                writeXY(`unit_${anim.unitId}`, lerp(from.x, to.x, progress), to.y);
                writeAlpha(`unit_${anim.unitId}`, progress);
            } else if (anim.kind === "explosion" || anim.kind === "sequence") {
                const urls = anim.urls ?? EXPLOSION_FRAME_URLS;
                const frameMs = anim.frameMs ?? EXPLOSION_FRAME_MS;
                const frame = Math.min(urls.length - 1, Math.floor((now - anim.start) / frameMs));
                writeUrl(`fx_effect_${anim.unitId}`, urls[frame]!);
            } else if (anim.kind === "projectile") {
                const urls = anim.urls ?? [];
                const projectileFrames = anim.projectileFrames ?? 0;
                const flightMs = projectileFrames * FIREBALL_PROJECTILE_FRAME_MS;
                const elapsed = now - anim.start;
                if (elapsed < flightMs) {
                    const from = anim.fromXY ?? homeXYOf(anim.unitId);
                    const to = anim.toXY ?? homeXYOf(anim.unitId);
                    const flightProgress = clamp01(elapsed / flightMs);
                    writeXY(`fx_effect_${anim.unitId}`, lerp(from.x, to.x, flightProgress), lerp(from.y, to.y, flightProgress));
                    const frame = Math.min(projectileFrames - 1, Math.floor(elapsed / FIREBALL_PROJECTILE_FRAME_MS));
                    writeUrl(`fx_effect_${anim.unitId}`, urls[frame]!);
                } else {
                    const to = anim.toXY ?? homeXYOf(anim.unitId);
                    writeXY(`fx_effect_${anim.unitId}`, to.x, to.y);
                    const impactFrame = Math.min(urls.length - projectileFrames - 1, Math.floor((elapsed - flightMs) / FIREBALL_IMPACT_FRAME_MS));
                    writeUrl(`fx_effect_${anim.unitId}`, urls[projectileFrames + impactFrame]!);
                }
            }

            if (now >= anim.end) {
                // 终态回位：飘字/闪白/爆炸 alpha=0；位移/入场对齐 state 坐标与 alpha=1
                if (anim.kind === "float" || anim.kind === "flash") {
                    writeAlpha(anim.kind === "float" ? `fx_float_${anim.unitId}` : `fx_flash_${anim.unitId}`, 0);
                } else if (anim.kind === "explosion" || anim.kind === "sequence" || anim.kind === "projectile") {
                    writeAlpha(`fx_effect_${anim.unitId}`, 0);
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
                writeAlpha(anim.kind === "float" ? `fx_float_${anim.unitId}` : `fx_flash_${anim.unitId}`, 0);
            } else if (anim.kind === "explosion" || anim.kind === "sequence" || anim.kind === "projectile") {
                writeAlpha(`fx_effect_${anim.unitId}`, 0);
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
