import type { HitFeedbackEffect } from "./effects";
import type { EffectNode } from "./EffectAnimator";
import { WARRIOR_FRAME_URLS, type WarriorAnim, type WarriorVariant } from "./animUrls";

/** 帧展示时长（ms）：idle 循环稍慢，attack 短促，death 完整倒地。 */
const IDLE_FRAME_MS = 80;
const ATTACK_FRAME_MS = 50;
const DEATH_FRAME_MS = 80;

/** 单位形象动画状态：当前动画 + 起始时间 + 变体（f/m 帧表选择）+ 当前帧索引（避免重复写帧）。 */
interface UnitAnimState {
    readonly anim: WarriorAnim;
    readonly variant: WarriorVariant;
    readonly start: number;
    /** 最近写入的帧索引（-1 表示尚未写入）：只在帧变化时 setUrl，避免每次 step 触发 GLoader 重载。 */
    frame: number;
}

/** 帧时长按动画类型选择（idle 循环 / attack 短促 / death 完整）。 */
function frameMs(anim: WarriorAnim): number {
    if (anim === "attack") {
        return ATTACK_FRAME_MS;
    }
    if (anim === "death") {
        return DEATH_FRAME_MS;
    }
    return IDLE_FRAME_MS;
}

/**
 * 单位形象动画器：驱动 Common/UnitSlot 内 `loader_unit_{unitId}` loader 逐帧播放
 * warrior 精灵表（按单位阵营选变体 f/m）。与 EffectAnimator 分工：本动画器是
 * **常驻状态**（存活单位持续循环 idle），EffectAnimator 管一次性反馈特效
 * （飘字/闪白/爆炸）。
 * - 存活单位持续播放 idle（循环）；attack 意图播完自动回 idle
 * - death 意图播放死亡帧序列，播完隐去（alpha=0，单位即将随绑定回收）
 * - 时间源为注入的毫秒时间戳函数（测试注入自增源确定性推进）
 * 纯引擎无关：经注入 node 解析器写 setUrl/setAlpha，不接触 fgui 类型。
 */
export function createUnitAnimator(options: {
    node: (name: string) => EffectNode | undefined;
    timeSource: () => number;
    /** 单位变体派生：presenter 注入从 state 查 side 映射 f/m（WARRIOR_VARIANT_BY_SIDE）。 */
    variantOf: (unitId: string) => WarriorVariant;
    /** 当前存活单位集合：presenter 每帧注入（用于 idle 循环与回收失效状态）。 */
    liveUnitIds: () => readonly string[];
}): {
    /** 消费单位动画意图（unit-anim attack/death）；其它意图忽略。 */
    play(effects: readonly HitFeedbackEffect[]): void;
    /** 每帧推进：存活单位 idle 循环 + 一次性动画推进与转场。 */
    step(): void;
    /** 进行中非 idle 动画数（attack/death 未播完；测试断言生命周期）。 */
    active(): number;
    /** 清空全部单位动画状态并回写 idle 首帧（restart 时调用）。 */
    reset(): void;
} {
    const { node, timeSource, variantOf, liveUnitIds } = options;
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

    /** 把单位切到指定动画并写首帧（alpha 恢复 1，死亡开始也保持可见）。 */
    function switchTo(id: string, anim: WarriorAnim, now: number): void {
        const variant = variantOf(id);
        states.set(id, { anim, variant, start: now, frame: -1 });
        writeUrl(id, WARRIOR_FRAME_URLS[variant][anim][0]!);
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
            switchTo(effect.unitId, effect.anim, now);
        }
    }

    function step(): void {
        const now = timeSource();
        const live = new Set(liveUnitIds());
        // 回收不再存活的单位动画状态（死亡播完或单位被移除）
        for (const id of states.keys()) {
            if (!live.has(id)) {
                states.delete(id);
            }
        }
        for (const id of live) {
            let state = states.get(id);
            if (state === undefined) {
                switchTo(id, "idle", now);
                state = states.get(id);
            }
            if (state === undefined) {
                continue;
            }
            const urls = WARRIOR_FRAME_URLS[state.variant][state.anim];
            const elapsed = now - state.start;
            const frame = Math.floor(elapsed / frameMs(state.anim));

            if (state.anim === "idle") {
                // idle 循环：帧索引取模循环（仅在帧变化时写帧）
                writeFrame(id, urls, frame);
            } else if (state.anim === "attack") {
                // attack 一次性：播完回 idle 循环
                if (frame < urls.length) {
                    writeFrame(id, urls, frame);
                } else {
                    switchTo(id, "idle", now);
                }
            } else if (state.anim === "death") {
                // death 一次性：播完隐去（alpha=0）并移除状态（单位随绑定回收，
                // 不再参与 idle 循环）；active() 不再计数
                if (frame < urls.length) {
                    writeFrame(id, urls, frame);
                } else {
                    writeAlpha(id, 0);
                    states.delete(id);
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
