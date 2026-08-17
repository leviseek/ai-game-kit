import type { HitFeedbackEffect } from "./effects";
import type { EffectNode } from "./EffectAnimator";
import { WARRIOR_FRAME_URLS, type WarriorAnim, type WarriorVariant } from "./animUrls";

/** 缺省帧时长；表驱动配置缺失时用于旧资源回退。 */
const DEATH_HOLD_MS = 900;
/** 一次性动作末帧停留：让收招姿势可读，避免最后一帧立即跳回 idle。 */
const END_HOLD_MS: Readonly<Record<WarriorAnim, number>> = {
    idle: 0,
    gesture: 120,
    walk: 0,
    run: 0,
    attack: 240,
    slash: 280,
    hit: 160,
    weak: 0,
    stun: 0,
    death: DEATH_HOLD_MS,
    skillRaise: 120,
};

const DEFAULT_FRAME_MS: Readonly<Record<WarriorAnim, number>> = {
    idle: 80,
    gesture: 80,
    walk: 80,
    run: 60,
    attack: 50,
    slash: 60,
    hit: 80,
    weak: 100,
    stun: 120,
    death: 80,
    skillRaise: 70,
};

/** 单位形象动画状态：当前动画 + 起始时间 + 变体（f/m 帧表选择）+ 当前帧索引（避免重复写帧）。 */
interface UnitAnimState {
    readonly anim: WarriorAnim;
    readonly variant: WarriorVariant;
    readonly start: number;
    /** 当前一次性动作结束后需要衔接的下一段。 */
    readonly nextAnim?: WarriorAnim;
    /** 最近写入的帧索引（-1 表示尚未写入）：只在帧变化时 setUrl，避免每次 step 触发 GLoader 重载。 */
    frame: number;
}

/**
 * 单位形象动画器：驱动 Common/UnitSlot 内 `loader_unit_{unitId}` loader 逐帧播放
 * warrior 精灵表（按单位阵营选变体 f/m）。与 EffectAnimator 分工：本动画器是
 * **常驻状态**（存活单位持续循环 idle），EffectAnimator 管一次性反馈特效
 * （飘字/闪白/爆炸）。
 * - idle/weak/stun 为常驻循环；walk/run 与各类攻击反馈播完自动回 idle
 * - death 意图在逻辑死亡后仍保留状态，播放完整序列再隐去（alpha=0）
 * - 时间源为注入的毫秒时间戳函数（测试注入自增源确定性推进）
 * - 帧 URL 支持表驱动：注入 frameUrlsOf（按单位查 unitAnimations 表）时优先使用，
 *   否则回退变体帧表（WARRIOR_FRAME_URLS，向后兼容无表配置）
 * 纯引擎无关：经注入 node 解析器写 setUrl/setAlpha，不接触 fgui 类型。
 */
export function createUnitAnimator(options: {
    node: (name: string) => EffectNode | undefined;
    timeSource: () => number;
    /** 单位变体派生：presenter 注入从 state 查 side 映射 f/m（WARRIOR_VARIANT_BY_SIDE）。 */
    variantOf: (unitId: string) => WarriorVariant;
    /** 当前存活单位集合：presenter 每帧注入（用于 idle 循环与回收失效状态）。 */
    liveUnitIds: () => readonly string[];
    /** 可选表驱动帧解析器：按单位 id 返回动画帧表；返回 undefined 时回退变体帧表。 */
    frameUrlsOf?: (unitId: string) => Readonly<Record<WarriorAnim, readonly string[]>> | undefined;
    /** 可选表驱动帧时长；缺失时回退 DEFAULT_FRAME_MS。 */
    frameMsOf?: (unitId: string, anim: WarriorAnim) => number | undefined;
}): {
    /** 消费 unit-anim 动画意图；其它表现意图忽略。 */
    play(effects: readonly HitFeedbackEffect[]): void;
    /** 每帧推进：存活单位 idle 循环 + 一次性动画推进与转场。 */
    step(): void;
    /** 当前非 idle 状态数，供测试断言一次性与常驻状态生命周期。 */
    active(): number;
    /** 清空全部单位动画状态并回写 idle 首帧（restart 时调用）。 */
    reset(): void;
} {
    const { node, timeSource, variantOf, liveUnitIds } = options;
    const frameUrlsOf = options.frameUrlsOf;
    const frameMsOf = options.frameMsOf;
    const states = new Map<string, UnitAnimState>();

    function resolve(id: string): EffectNode | undefined {
        return node(`loader_unit_${id}`);
    }

    function writeUrl(id: string, value: string): void {
        resolve(id)?.setUrl?.(value);
    }

    function writeAlpha(id: string, value: number): void {
        resolve(id)?.setAlpha?.(value);
    }

    /** 解析单位动画帧表：注入表驱动解析器优先，否则按变体回退缺省帧表。 */
    function urlsOf(id: string, anim: WarriorAnim): readonly string[] {
        const frameUrls = frameUrlsOf?.(id);
        if (frameUrls !== undefined) {
            return frameUrls[anim];
        }
        return WARRIOR_FRAME_URLS[variantOf(id)][anim];
    }
    /** 把单位切到指定动画并写首帧（alpha 恢复 1，死亡开始也保持可见）。 */
    function switchTo(id: string, anim: WarriorAnim, now: number, nextAnim?: WarriorAnim): void {
        const variant = variantOf(id);
        states.set(id, { anim, variant, start: now, frame: -1, nextAnim });
        writeUrl(id, urlsOf(id, anim)[0]!);
        writeAlpha(id, 1);
    }

    /** 写帧：仅在帧索引变化时 setUrl（帧不变则跳过，避免 GLoader 重复 clearContent+load）。 */
    function writeFrame(id: string, urls: readonly string[], frame: number): void {
        const state = states.get(id);
        if (state === undefined || state.frame === frame) {
            return;
        }
        states.set(id, { ...state, frame });
        writeUrl(id, urls[frame % urls.length]!);
    }

    function play(effects: readonly HitFeedbackEffect[]): void {
        const now = timeSource();
        for (const effect of effects) {
            if (effect.kind !== "unit-anim") {
                continue;
            }
            if (!states.has(effect.unitId)) {
                // 未激活单位（非存活/未初始化）忽略：idle 由 step 统一初始化
                continue;
            }
            switchTo(effect.unitId, effect.anim, now, effect.nextAnim);
        }
    }

    function step(): void {
        const now = timeSource();
        const live = new Set(liveUnitIds());
        // 非存活单位仅保留正在播放的死亡状态，直到完整序列结束。
        for (const [id, state] of states) {
            if (!live.has(id) && state.anim !== "death") {
                states.delete(id);
            }
        }
        const activeIds = new Set(live);
        for (const [id, state] of states) {
            if (state.anim === "death") {
                activeIds.add(id);
            }
        }
        for (const id of activeIds) {
            let state = states.get(id);
            if (state === undefined) {
                switchTo(id, "idle", now);
                state = states.get(id);
            }
            if (state === undefined) {
                continue;
            }
            const urls = urlsOf(id, state.anim);
            const elapsed = now - state.start;
            const duration = frameMsOf?.(id, state.anim) ?? DEFAULT_FRAME_MS[state.anim];
            const frame = Math.floor(elapsed / duration);
            const playbackMs = urls.length * duration;

            if (state.anim === "idle" || state.anim === "weak" || state.anim === "stun") {
                // 常驻循环状态，直到更高优先级意图覆盖。
                writeFrame(id, urls, frame);
            } else if (state.anim === "death") {
                // death 一次性：播完隐去并移除状态。
                if (frame < urls.length) {
                    writeFrame(id, urls, frame);
                } else if (elapsed < playbackMs + DEATH_HOLD_MS) {
                    // 倒地末帧额外停留，避免逻辑死亡后角色只闪现一瞬。
                    writeFrame(id, urls, urls.length - 1);
                } else {
                    writeAlpha(id, 0);
                    states.delete(id);
                }
            } else {
                // 一次性动作播放一轮后衔接 nextAnim，未声明则回 idle。
                if (frame < urls.length) {
                    writeFrame(id, urls, frame);
                } else if (elapsed < playbackMs + END_HOLD_MS[state.anim]) {
                    writeFrame(id, urls, urls.length - 1);
                } else if (state.nextAnim !== undefined) {
                    switchTo(id, state.nextAnim, now);
                } else {
                    switchTo(id, "idle", now);
                }
            }
        }
    }

    function reset(): void {
        const now = timeSource();
        const live = new Set(liveUnitIds());
        for (const id of states.keys()) {
            if (!live.has(id)) {
                states.delete(id);
            }
        }
        for (const id of live) {
            switchTo(id, "idle", now);
        }
    }

    return {
        play,
        step,
        active: () => {
            let count = 0;
            for (const state of states.values()) {
                if (state.anim !== "idle") {
                    count += 1;
                }
            }
            return count;
        },
        reset,
    };
}
