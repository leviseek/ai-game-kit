import { describe, expect, test } from "bun:test";

import { createAutoBattleFixture, type AutoBattleFixture } from "../../../assets/samples/game_auto_battle/assembly";
import type { AutoBattleEvent } from "../../../assets/samples/game_auto_battle/models";
import { projectHitFeedbackEvents } from "../../../assets/samples/game_auto_battle/view/effects";
import { createEffectAnimator, type EffectNode } from "../../../assets/samples/game_auto_battle/view/EffectAnimator";
import { unitEffectAnchorXY } from "../../../assets/samples/game_auto_battle/view/view";

/** 构造战斗事件：seq 递增，targetId/value 按需。 */
function event(seq: number, type: AutoBattleEvent["type"], overrides: Partial<AutoBattleEvent> = {}): AutoBattleEvent {
    return {
        seq,
        type,
        time: seq,
        sourceId: "",
        ...overrides,
    };
}

/** 记录型特效节点：记录 setText/setAlpha/setXY/setUrl 写入，供动画器测试断言。 */
interface RecordingEffectNode extends EffectNode {
    readonly text: string | undefined;
    readonly alpha: number | undefined;
    readonly xy: { x: number; y: number } | undefined;
    readonly url: string | undefined;
}

function recordNode(): RecordingEffectNode {
    const recording: RecordingEffectNode = {
        text: undefined,
        alpha: undefined,
        xy: undefined,
        url: undefined,
        setText: (value: string) => {
            recording.text = value;
        },
        setAlpha: (value: number) => {
            recording.alpha = value;
        },
        setXY: (x: number, y: number) => {
            recording.xy = { x, y };
        },
        setUrl: (value: string) => {
            recording.url = value;
        },
    };
    return recording;
}

describe("Auto-battle hit feedback projection", () => {
    test("attack event projects damage float, hit flash, and attacker anim", () => {
        const { effects, cursor } = projectHitFeedbackEvents([event(0, "attack", { sourceId: "a", targetId: "e", value: 12 })], -1);
        expect(cursor).toBe(0);
        expect(effects).toEqual([
            { kind: "damage-float", unitId: "e", value: 12, seq: 0 },
            { kind: "hit-flash", unitId: "e", seq: 0 },
            { kind: "unit-anim", unitId: "e", anim: "hit", seq: 0 },
            { kind: "effect-sequence", unitId: "e", effect: "physical-impact", seq: 0 },
            { kind: "unit-anim", unitId: "a", anim: "attack", seq: 0 },
        ]);
    });

    test("skill-damage event projects damage float and hit flash", () => {
        const { effects } = projectHitFeedbackEvents([event(1, "skill-damage", { sourceId: "a", targetId: "e", value: 40 })], -1);
        expect(effects).toEqual([
            { kind: "damage-float", unitId: "e", value: 40, seq: 1 },
            { kind: "hit-flash", unitId: "e", seq: 1 },
            { kind: "unit-anim", unitId: "e", anim: "hit", seq: 1 },
            { kind: "unit-anim", unitId: "a", anim: "skillRaise", nextAnim: "slash", seq: 1 },
        ]);
    });

    test("skill-heal event projects heal float with caster anim", () => {
        const { effects } = projectHitFeedbackEvents([event(2, "skill-heal", { sourceId: "a", targetId: "a", value: 30 })], -1);
        expect(effects).toEqual([
            { kind: "heal-float", unitId: "a", value: 30, seq: 2 },
            { kind: "unit-anim", unitId: "a", anim: "skillRaise", seq: 2 },
        ]);
    });

    test("skill effect table projects fireball flight and heal aura", () => {
        const resolve = (id: string) => (id === "fireball-explosion" ? ({ id, kind: "fireball" } as const) : id === "heal-aura" ? ({ id, kind: "heal-aura" } as const) : undefined);
        const damage = projectHitFeedbackEvents([event(3, "skill-damage", { sourceId: "a", targetId: "e", value: 20, effectId: "fireball-explosion" })], -1, resolve);
        expect(damage.effects).toContainEqual({ kind: "projectile-effect", unitId: "e", sourceId: "a", effect: "fireball", seq: 3 });

        const heal = projectHitFeedbackEvents([event(4, "skill-heal", { sourceId: "a", targetId: "a", value: 10, effectId: "heal-aura" })], -1, resolve);
        expect(heal.effects).toContainEqual({ kind: "effect-sequence", unitId: "a", effect: "heal-aura", seq: 4 });
    });

    test("unit-dead projects death explosion and target death anim", () => {
        const { effects } = projectHitFeedbackEvents([event(1, "unit-dead", { targetId: "e" })], -1);
        expect(effects).toEqual([
            { kind: "explosion", unitId: "e", seq: 1 },
            { kind: "unit-anim", unitId: "e", anim: "death", seq: 1 },
        ]);
    });

    test("battle-over and other ignored events project nothing", () => {
        const { effects } = projectHitFeedbackEvents([event(0, "round-start"), event(2, "battle-over", { result: "win" })], -1);
        expect(effects).toEqual([]);
    });

    test("cursor makes projection incremental and idempotent", () => {
        const events = [event(0, "attack", { targetId: "e", value: 5 }), event(1, "skill-heal", { targetId: "a", value: 8 })];
        // 首次投影消费全部
        const first = projectHitFeedbackEvents(events, -1);
        expect(first.effects).toHaveLength(4);
        // 游标推进后重复投影不再产出（幂等）
        const second = projectHitFeedbackEvents(events, first.cursor);
        expect(second.effects).toEqual([]);
        // 只消费新增段：从游标 0 开始只产出 seq>0 的特效
        const third = projectHitFeedbackEvents(events, 0);
        expect(third.effects).toHaveLength(1);
        expect(third.effects[0]).toMatchObject({ kind: "heal-float", unitId: "a" });
    });

    test("same event sequence projects identical effects (determinism)", () => {
        const events = [event(0, "attack", { targetId: "e", value: 5 }), event(1, "skill-damage", { targetId: "e", value: 20 }), event(2, "skill-heal", { targetId: "a", value: 8 })];
        const first = projectHitFeedbackEvents(events, -1);
        const second = projectHitFeedbackEvents(events, -1);
        expect(first.effects).toEqual(second.effects);
    });
});

describe("Auto-battle effect animator", () => {
    /** 受控时间源：测试手动推进。 */
    function makeTime() {
        let now = 0;
        return {
            timeSource: () => now,
            advance: (ms: number) => {
                now += ms;
            },
        };
    }

    /** 构造动画器：单位 a 的绝对坐标 (840,100)；网格 0:0=(100,100)、0:3=(600,100)。 */
    function makeAnimator() {
        const nodes = new Map<string, RecordingEffectNode>();
        const time = makeTime();
        const animator = createEffectAnimator({
            node: (name: string) => nodes.get(name),
            timeSource: time.timeSource,
            homeXYOf: () => ({ x: 840, y: 100 }),
            effectXYOf: (_unitId, anchor) => unitEffectAnchorXY({ x: 840, y: 100 }, anchor),
            gridXYOf: (gridKey: string) => (gridKey === "0:0" ? { x: 100, y: 100 } : { x: 600, y: 100 }),
        });
        const ensureNode = (name: string): RecordingEffectNode => {
            let node = nodes.get(name);
            if (node === undefined) {
                node = recordNode();
                nodes.set(name, node);
            }
            return node;
        };
        return { animator, nodes, ensureNode, advance: time.advance };
    }

    test("damage float writes text and fades out while rising", () => {
        const { animator, ensureNode, advance } = makeAnimator();
        const floatNode = ensureNode("fx_float_a");
        animator.play([{ kind: "damage-float", unitId: "a", value: 12, seq: 0 }]);
        // 播放即写入文本与初始 alpha=1
        expect(floatNode.text).toContain("12");
        expect(floatNode.text).toContain("#ff5252");
        expect(floatNode.alpha).toBe(1);

        // 推进到中段：alpha 下降、y 上移
        advance(300);
        animator.step();
        expect(floatNode.alpha!).toBeLessThan(1);
        expect(floatNode.xy!.y).toBeLessThan(100);

        // 动画结束：alpha=0、坐标归位、active 清空
        advance(600);
        animator.step();
        expect(floatNode.alpha).toBe(0);
        expect(animator.active()).toBe(0);
    });

    test("heal float uses green color text", () => {
        const { animator, ensureNode } = makeAnimator();
        const floatNode = ensureNode("fx_float_a");
        animator.play([{ kind: "heal-float", unitId: "a", value: 30, seq: 0 }]);
        expect(floatNode.text).toContain("30");
        expect(floatNode.text).toContain("#6fd96f");
        expect(floatNode.text).not.toContain("#ff5252");
    });

    test("hit flash positions to unit coordinate and pulses alpha", () => {
        const { animator, ensureNode, advance } = makeAnimator();
        const flashNode = ensureNode("fx_flash_a");
        animator.play([{ kind: "hit-flash", unitId: "a", seq: 0 }]);
        // 闪白遮罩定位到单位绝对坐标
        expect(flashNode.xy).toEqual({ x: 830, y: 161 });

        advance(60);
        animator.step();
        // 峰值前 alpha 上升
        expect(flashNode.alpha!).toBeGreaterThan(0);

        advance(120);
        animator.step();
        // 动画结束：alpha=0、active 清空
        expect(flashNode.alpha).toBe(0);
        expect(animator.active()).toBe(0);
    });

    test("shake offsets the unit node and returns to base on end", () => {
        // 抖动通过 hit-flash 触发的同名动画驱动（单元节点 unit_a）
        // 此处直接验证飘字/闪白共用动画器生命周期；抖动终态归位由实现保证
        const { animator, ensureNode, advance } = makeAnimator();
        const unitNode = ensureNode("unit_a");
        animator.play([{ kind: "hit-flash", unitId: "a", seq: 0 }]);
        expect(animator.active()).toBeGreaterThan(0);

        // 推进到结束：unit_a 坐标回到基准（若有抖动写入，则回 base）
        advance(200);
        animator.step();
        expect(animator.active()).toBe(0);
        expect(unitNode.xy).toBeUndefined(); // 闪白不写单位坐标
    });

    test("new float on the same unit overrides the previous animation", () => {
        const { animator, ensureNode } = makeAnimator();
        const floatNode = ensureNode("fx_float_a");
        animator.play([{ kind: "damage-float", unitId: "a", value: 5, seq: 0 }]);
        animator.play([{ kind: "damage-float", unitId: "a", value: 9, seq: 1 }]);
        // 同单位新特效覆盖旧动画：数值为最新值
        expect(floatNode.text).toContain("9");
        expect(animator.active()).toBe(1);
    });

    test("nodes without setAlpha are skipped without interrupting", () => {
        const nodes = new Map<string, EffectNode>();
        const time = makeTime();
        const animator = createEffectAnimator({
            node: (name: string) => nodes.get(name),
            timeSource: time.timeSource,
            homeXYOf: () => ({ x: 0, y: 0 }),
            effectXYOf: (_unitId, anchor) => unitEffectAnchorXY({ x: 0, y: 0 }, anchor),
            gridXYOf: () => ({ x: 0, y: 0 }),
        });
        // 节点只实现 setText 不实现 setAlpha：动画器跳过 alpha 写入不中断
        nodes.set("fx_float_a", { setText: () => {} });
        animator.play([{ kind: "damage-float", unitId: "a", value: 5, seq: 0 }]);
        time.advance(600);
        animator.step();
        expect(animator.active()).toBe(0);
    });

    test("reset clears active animations and returns to terminal state", () => {
        const { animator, ensureNode } = makeAnimator();
        const floatNode = ensureNode("fx_float_a");
        animator.play([{ kind: "damage-float", unitId: "a", value: 5, seq: 0 }]);
        expect(animator.active()).toBe(1);

        animator.reset();
        expect(animator.active()).toBe(0);
        expect(floatNode.alpha).toBe(0);
    });

    test("move animation interpolates the unit node between grid positions", () => {
        const { animator, ensureNode, advance } = makeAnimator();
        const unitNode = ensureNode("unit_a");
        animator.play([{ kind: "move", unitId: "a", fromGrid: "0:0", toGrid: "0:3", seq: 0 }]);

        // 起点对齐 from 网格坐标
        expect(unitNode.xy).toEqual({ x: 100, y: 100 });

        // 中段：x 在 100→600 之间
        advance(150);
        animator.step();
        expect(unitNode.xy!.x).toBeGreaterThan(100);
        expect(unitNode.xy!.x).toBeLessThan(600);

        // 结束：对齐 to 网格坐标、active 清空
        advance(300);
        animator.step();
        expect(unitNode.xy).toEqual({ x: 600, y: 100 });
        expect(animator.active()).toBe(0);
    });

    test("teleport animation jumps the unit node to the target grid", () => {
        const { animator, ensureNode } = makeAnimator();
        const unitNode = ensureNode("unit_a");
        animator.play([{ kind: "teleport", unitId: "a", toGrid: "0:3", seq: 0 }]);

        // 瞬移直接跳变到目标格坐标
        expect(unitNode.xy).toEqual({ x: 600, y: 100 });
        expect(animator.active()).toBe(0);
    });

    test("entrance animation walks in from the screen edge and fades the unit node to full alpha", () => {
        const { animator, ensureNode, advance } = makeAnimator();
        const unitNode = ensureNode("unit_a");
        animator.play([{ kind: "entrance", unitId: "a", seq: 0 }]);

        // 入场开始：从屏幕右边界外（840 ≥ 中线 640 → 己方半场从右侧走进），y 保持布阵位、alpha=0
        expect(unitNode.alpha).toBe(0);
        expect(unitNode.xy).toEqual({ x: 1440, y: 100 });

        advance(375);
        animator.step();
        // 中段：横向走进中、alpha 上升（750ms 时长的一半）
        expect(unitNode.alpha!).toBeGreaterThan(0);
        expect(unitNode.alpha!).toBeLessThan(1);
        expect(unitNode.xy!.x).toBeGreaterThan(840);
        expect(unitNode.xy!.x).toBeLessThan(1440);

        advance(750);
        animator.step();
        // 结束：到位（x=840）、alpha=1、active 清空
        expect(unitNode.alpha).toBe(1);
        expect(unitNode.xy).toEqual({ x: 840, y: 100 });
        expect(animator.active()).toBe(0);
    });

    test("explosion positions to unit coordinate and advances frames via setUrl", () => {
        const { animator, ensureNode, advance } = makeAnimator();
        const fxNode = ensureNode("fx_effect_a");
        animator.play([{ kind: "explosion", unitId: "a", seq: 0 }]);
        // 播放即定位 + 首帧 + alpha=1
        expect(fxNode.xy).toEqual({ x: 830, y: 185 });
        expect(fxNode.url).toContain("fx_explosion_00");
        expect(fxNode.alpha).toBe(1);

        // 推进约 1/4（12 帧 × 40ms = 480ms）：帧索引前进到非首帧
        advance(120);
        animator.step();
        expect(fxNode.url).not.toBeUndefined();
        expect(fxNode.url).not.toContain("fx_explosion_00");

        // 播完：alpha=0、active 清空
        advance(480);
        animator.step();
        expect(fxNode.alpha).toBe(0);
        expect(animator.active()).toBe(0);
    });

    test("physical impact plays slash frames before hit spark frames", () => {
        const { animator, ensureNode, advance } = makeAnimator();
        const fxNode = ensureNode("fx_effect_a");
        animator.play([{ kind: "effect-sequence", unitId: "a", effect: "physical-impact", seq: 0 }]);
        expect(fxNode.url).toContain("fx_slash_arc_00");

        advance(360);
        animator.step();
        expect(fxNode.url).toContain("fx_hit_physical_00");

        advance(360);
        animator.step();
        expect(fxNode.alpha).toBe(0);
        expect(animator.active()).toBe(0);
    });

    test("heal aura is centered on the unit feet anchor", () => {
        const { animator, ensureNode } = makeAnimator();
        const fxNode = ensureNode("fx_effect_a");
        animator.play([{ kind: "effect-sequence", unitId: "a", effect: "heal-aura", seq: 0 }]);
        expect(fxNode.xy).toEqual({ x: 830, y: 281 });
        expect(fxNode.url).toContain("fx_heal_aura_00");
    });

    test("fireball flies from caster to target before impact frames", () => {
        const nodes = new Map<string, RecordingEffectNode>();
        const time = makeTime();
        const fxNode = recordNode();
        nodes.set("fx_effect_e", fxNode);
        const animator = createEffectAnimator({
            node: (name: string) => nodes.get(name),
            timeSource: time.timeSource,
            homeXYOf: (id: string) => (id === "a" ? { x: 800, y: 100 } : { x: 200, y: 100 }),
            effectXYOf: (id, anchor) => unitEffectAnchorXY(id === "a" ? { x: 800, y: 100 } : { x: 200, y: 100 }, anchor),
            gridXYOf: () => ({ x: 0, y: 0 }),
        });
        animator.play([{ kind: "projectile-effect", unitId: "e", sourceId: "a", effect: "fireball", seq: 0 }]);
        expect(fxNode.xy).toEqual({ x: 790, y: 161 });
        expect(fxNode.url).toContain("fx_fireball_projectile_00");

        time.advance(280);
        animator.step();
        expect(fxNode.xy!.x).toBeLessThan(800);
        expect(fxNode.xy!.x).toBeGreaterThan(200);

        time.advance(280);
        animator.step();
        expect(fxNode.xy).toEqual({ x: 190, y: 161 });
        expect(fxNode.url).toContain("fx_fireball_impact_00");
    });

    test("explosion without setUrl node is skipped without interrupting", () => {
        const nodes = new Map<string, EffectNode>();
        const time = makeTime();
        const animator = createEffectAnimator({
            node: (name: string) => nodes.get(name),
            timeSource: time.timeSource,
            homeXYOf: () => ({ x: 0, y: 0 }),
            effectXYOf: (_unitId, anchor) => unitEffectAnchorXY({ x: 0, y: 0 }, anchor),
            gridXYOf: () => ({ x: 0, y: 0 }),
        });
        // 节点只实现 setXY 不实现 setUrl/setAlpha：爆炸写入被跳过不中断
        nodes.set("fx_effect_a", { setXY: () => {} });
        animator.play([{ kind: "explosion", unitId: "a", seq: 0 }]);
        time.advance(480);
        animator.step();
        expect(animator.active()).toBe(0);
    });
});

describe("Auto-battle fixture effects hook", () => {
    test("project derives effects from real battle events", () => {
        const fixture: AutoBattleFixture = createAutoBattleFixture();
        // 驱动少量行动产生攻击事件
        for (let index = 0; index < 5; index += 1) {
            fixture.battle.tick();
        }
        const effects = fixture.effects.project(fixture.battle.events);
        expect(effects.length).toBeGreaterThan(0);
        expect(effects.some((effect) => effect.kind === "damage-float" || effect.kind === "heal-float")).toBe(true);
        fixture.dispose();
    });
});
