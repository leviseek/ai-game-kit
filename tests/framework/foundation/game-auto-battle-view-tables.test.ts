import { describe, expect, test } from "bun:test";

import { createUnitAnimator } from "../../../assets/samples/game_auto_battle/view/UnitAnimator";
import { buildUnitAnimationFrames } from "../../../assets/samples/game_auto_battle/view/animUrls";
import type { AutoBattleUnitAnimation } from "../../../assets/samples/game_auto_battle/models";
import type { EffectNode } from "../../../assets/samples/game_auto_battle/view/EffectAnimator";
import { projectHitFeedbackEvents } from "../../../assets/samples/game_auto_battle/view/effects";
import type { AutoBattleEvent } from "../../../assets/samples/game_auto_battle/models";

/** 记录型特效节点：记录 setUrl/setAlpha 写入。 */
interface RecordingNode extends EffectNode {
    readonly url: string | undefined;
    readonly alpha: number | undefined;
}

function recordNode(): RecordingNode {
    const recording: RecordingNode = {
        url: undefined,
        alpha: undefined,
        setUrl: (value: string) => {
            recording.url = value;
        },
        setAlpha: (value: number) => {
            recording.alpha = value;
        },
    };
    return recording;
}

function makeTime() {
    let now = 0;
    return {
        timeSource: () => now,
        advance: (ms: number) => {
            now += ms;
        },
    };
}

/** 构造动画表条目：2 帧的迷你表便于断言帧 URL 形状。 */
const MINI_ANIM: AutoBattleUnitAnimation = {
    id: "warrior-x",
    bundle: "animations",
    dir: "auto-battle",
    frameCount: 2,
    frameCountByAnim: { idle: 2, gesture: 2, walk: 2, run: 2, attack: 2, slash: 2, hit: 2, weak: 2, stun: 2, death: 2, skillRaise: 2 },
    frameMsByAnim: { idle: 80, gesture: 80, walk: 80, run: 60, attack: 50, slash: 60, hit: 80, weak: 100, stun: 120, death: 80, skillRaise: 70 },
    prefixByAnim: {
        idle: "warrior_x_idle",
        gesture: "warrior_x_gesture",
        walk: "warrior_x_walk",
        run: "warrior_x_run",
        attack: "warrior_x_attack",
        slash: "warrior_x_slash",
        hit: "warrior_x_hit",
        weak: "warrior_x_weak",
        stun: "warrior_x_stun",
        death: "warrior_x_death",
        skillRaise: "warrior_x_skill_raise",
    },
};

describe("Auto-battle unit animation table", () => {
    test("builds frame urls from the animation table entry", () => {
        const frames = buildUnitAnimationFrames(MINI_ANIM);
        expect(frames.idle).toEqual(["bundle://animations/auto-battle/warrior_x_idle_00", "bundle://animations/auto-battle/warrior_x_idle_01"]);
        expect(frames.attack[0]).toBe("bundle://animations/auto-battle/warrior_x_attack_00");
        expect(frames.death[1]).toBe("bundle://animations/auto-battle/warrior_x_death_01");
        // 全部动画名都覆盖
        for (const anim of ["idle", "gesture", "walk", "run", "attack", "slash", "hit", "weak", "stun", "death", "skillRaise"] as const) {
            expect(frames[anim]).toHaveLength(2);
        }
    });

    test("AI 动画条目按动作独立帧数生成 URL", () => {
        const aiAnim: AutoBattleUnitAnimation = {
            id: "warrior-ai",
            bundle: "animations",
            dir: "auto-battle",
            frameCount: 1,
            frameCountByAnim: { idle: 1, gesture: 1, walk: 8, run: 8, attack: 6, slash: 8, hit: 4, weak: 6, stun: 4, death: 10, skillRaise: 8 },
            frameMsByAnim: { idle: 80, gesture: 80, walk: 80, run: 60, attack: 50, slash: 60, hit: 80, weak: 100, stun: 120, death: 80, skillRaise: 70 },
            prefixByAnim: {
                idle: "warrior_ai_idle",
                gesture: "warrior_ai_idle",
                walk: "warrior_ai_walk",
                run: "warrior_ai_run",
                attack: "warrior_ai_attack",
                slash: "warrior_ai_slash",
                hit: "warrior_ai_hit",
                weak: "warrior_ai_weak",
                stun: "warrior_ai_stun",
                death: "warrior_ai_death",
                skillRaise: "warrior_ai_skill_raise",
            },
        };
        const frames = buildUnitAnimationFrames(aiAnim);
        expect(frames.idle).toEqual(["bundle://animations/auto-battle/warrior_ai_idle_00"]);
        expect(frames.walk[0]).toBe("bundle://animations/auto-battle/warrior_ai_walk_00");
        expect(frames.attack[0]).toBe("bundle://animations/auto-battle/warrior_ai_attack_00");
        expect(frames.death[9]).toBe("bundle://animations/auto-battle/warrior_ai_death_09");
        expect(frames.walk).toHaveLength(8);
        expect(frames.attack).toHaveLength(6);
        expect(frames.hit).toHaveLength(4);
        expect(frames.death).toHaveLength(10);
        expect(frames.skillRaise).toHaveLength(8);
    });

    test("unit animator plays frames from the injected animation table", () => {
        const nodes = new Map<string, RecordingNode>();
        const time = makeTime();
        const animator = createUnitAnimator({
            node: (name: string) => {
                let node = nodes.get(name);
                if (node === undefined) {
                    node = recordNode();
                    nodes.set(name, node);
                }
                return node;
            },
            timeSource: time.timeSource,
            variantOf: () => "f" as const,
            liveUnitIds: () => ["a"],
            // 表驱动帧解析：单位 a 使用迷你动画表
            frameUrlsOf: () => buildUnitAnimationFrames(MINI_ANIM),
            frameMsOf: (_unitId, anim) => MINI_ANIM.frameMsByAnim[anim],
        });

        animator.step();
        const allyNode = nodes.get("loader_unit_a")!;
        expect(allyNode.url).toBe("bundle://animations/auto-battle/warrior_x_idle_00");

        animator.play([{ kind: "unit-anim", unitId: "a", anim: "attack", seq: 0 }]);
        expect(allyNode.url).toBe("bundle://animations/auto-battle/warrior_x_attack_00");

        // 推进一帧：attack 第 2 帧（frameCount=2）
        time.advance(50);
        animator.step();
        expect(allyNode.url).toBe("bundle://animations/auto-battle/warrior_x_attack_01");

        animator.reset();
    });
});

describe("Auto-battle skill effect table projection", () => {
    function event(seq: number, type: AutoBattleEvent["type"], overrides: Partial<AutoBattleEvent> = {}): AutoBattleEvent {
        return {
            seq,
            type,
            time: seq,
            sourceId: "",
            ...overrides,
        };
    }

    test("skill-damage with an effect id projects the mapped extra effect", () => {
        const resolveEffect = (effectId: string) => (effectId === "fireball-explosion" ? { id: effectId, kind: "explosion" as const } : undefined);
        const { effects } = projectHitFeedbackEvents([event(0, "skill-damage", { sourceId: "a", targetId: "e", value: 15, effectId: "fireball-explosion" })], -1, resolveEffect);
        // 默认伤害飘字/闪白/施法动画之外，额外投影爆炸动效
        expect(effects.some((effect) => effect.kind === "explosion" && effect.unitId === "e")).toBe(true);
        // 默认投影仍保留（表驱动是增量叠加）
        expect(effects.some((effect) => effect.kind === "damage-float")).toBe(true);
    });

    test("skill-damage without a resolved effect keeps the default projection", () => {
        const resolveEffect = () => undefined;
        const { effects } = projectHitFeedbackEvents([event(0, "skill-damage", { sourceId: "a", targetId: "e", value: 15 })], -1, resolveEffect);
        expect(effects.some((effect) => effect.kind === "explosion")).toBe(false);
        expect(effects.some((effect) => effect.kind === "damage-float")).toBe(true);
    });
});
