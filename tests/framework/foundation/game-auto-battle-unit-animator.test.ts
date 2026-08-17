import { describe, expect, test } from "bun:test";

import { createUnitAnimator } from "../../../assets/samples/game_auto_battle/view/UnitAnimator";
import { WARRIOR_FRAME_URLS, type WarriorVariant } from "../../../assets/samples/game_auto_battle/view/animUrls";
import type { EffectNode } from "../../../assets/samples/game_auto_battle/view/EffectAnimator";
import { AUTO_BATTLE_UNIT_NODE_MAPPING } from "../../../assets/samples/game_auto_battle/view/UnitNodeMapping";

/** 记录型特效节点：记录 setUrl/setAlpha 写入，供单位动画器测试断言。 */
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

describe("Auto-battle unit animator", () => {
    /** 构造动画器：单位 a=ally(f)、e=enemy(m)；存活集合可注入。 */
    function makeAnimator(initialAlive: readonly string[] = ["a", "e"]) {
        const nodes = new Map<string, RecordingNode>();
        const time = makeTime();
        let alive = [...initialAlive];
        const animator = createUnitAnimator({
            // 惰性创建节点（对齐 assembly ensureViewNode 语义）：动画器首次写入时登记
            node: (name: string) => {
                let node = nodes.get(name);
                if (node === undefined) {
                    node = recordNode();
                    nodes.set(name, node);
                }
                return node;
            },
            timeSource: time.timeSource,
            variantOf: (unitId: string) => (unitId === "a" ? "f" : "m") as WarriorVariant,
            liveUnitIds: () => alive,
        });
        const ensureNode = (id: string): RecordingNode => nodes.get(`loader_unit_${id}`)!;
        return {
            animator,
            nodes,
            ensureNode,
            time,
            setAlive: (ids: readonly string[]) => {
                alive = [...ids];
            },
        };
    }

    test("live units play idle loop frames by variant", () => {
        const { animator, ensureNode, time } = makeAnimator();
        // 初始 step 把存活单位切到 idle 首帧
        animator.step();
        const allyNode = ensureNode("a");
        const enemyNode = ensureNode("e");
        expect(allyNode.url).toBe(WARRIOR_FRAME_URLS.f.idle[0]);
        expect(enemyNode.url).toBe(WARRIOR_FRAME_URLS.m.idle[0]);

        // 推进一个 idle 帧时长（80ms）：帧索引前进到 idle 第 2 帧
        time.advance(80);
        animator.step();
        expect(allyNode.url).toBe(WARRIOR_FRAME_URLS.f.idle[1]);

        // 帧未变时重复 step 不重写 URL（去重：避免 GLoader 重复加载）
        animator.step();
        expect(allyNode.url).toBe(WARRIOR_FRAME_URLS.f.idle[1]);

        // 推进足够时长：idle 循环回绕
        time.advance(80 * 10);
        animator.step();
        expect(allyNode.url).toBe(WARRIOR_FRAME_URLS.f.idle[1 % 10]);
    });

    test("attack anim plays once then returns to idle", () => {
        const { animator, ensureNode, time } = makeAnimator();
        animator.step();
        animator.play([{ kind: "unit-anim", unitId: "a", anim: "attack", seq: 0 }]);
        const allyNode = ensureNode("a");
        // 播放即切到 attack 首帧
        expect(allyNode.url).toBe(WARRIOR_FRAME_URLS.f.attack[0]);
        expect(animator.active()).toBe(1);

        // attack 帧时长 50ms：推进一帧切到 attack 第 2 帧
        time.advance(50);
        animator.step();
        expect(allyNode.url).toBe(WARRIOR_FRAME_URLS.f.attack[1]);

        // 推进足够时长越过 attack 全部 10 帧：回 idle 循环
        time.advance(50 * 20);
        animator.step();
        expect(allyNode.url).toBe(WARRIOR_FRAME_URLS.f.idle[0]);
        expect(animator.active()).toBe(0);
    });

    test("skill raise chains into slash before returning to idle", () => {
        const { animator, ensureNode, time } = makeAnimator();
        animator.step();
        animator.play([{ kind: "unit-anim", unitId: "a", anim: "skillRaise", nextAnim: "slash", seq: 0 }]);
        const allyNode = ensureNode("a");
        expect(allyNode.url).toBe(WARRIOR_FRAME_URLS.f.skillRaise[0]);

        time.advance(70 * 10);
        animator.step();
        expect(allyNode.url).toBe(WARRIOR_FRAME_URLS.f.slash[0]);

        time.advance(60 * 10);
        animator.step();
        expect(allyNode.url).toBe(WARRIOR_FRAME_URLS.f.idle[0]);
    });

    test("death anim plays once then hides the node", () => {
        const { animator, ensureNode, time } = makeAnimator();
        animator.step();
        animator.play([{ kind: "unit-anim", unitId: "e", anim: "death", seq: 0 }]);
        const enemyNode = ensureNode("e");
        expect(enemyNode.url).toBe(WARRIOR_FRAME_URLS.m.death[0]);
        expect(animator.active()).toBe(1);

        // 10 帧播完后保持倒地末帧，避免刚死亡就消失。
        time.advance(80 * 10);
        animator.step();
        expect(enemyNode.url).toBe(WARRIOR_FRAME_URLS.m.death[9]);
        expect(enemyNode.alpha).toBe(1);
        expect(animator.active()).toBe(1);

        time.advance(900);
        animator.step();
        expect(enemyNode.alpha).toBe(0);
        expect(animator.active()).toBe(0);
    });

    test("death animation survives live-set removal until its final frame", () => {
        const { animator, setAlive, time, ensureNode } = makeAnimator();
        animator.step();
        animator.play([{ kind: "unit-anim", unitId: "a", anim: "death", seq: 0 }]);
        expect(animator.active()).toBe(1);

        // 逻辑层移除死亡单位后，表现层仍保留死亡序列。
        setAlive(["e"]);
        animator.step();
        expect(animator.active()).toBe(1);
        time.advance(80 * 30);
        animator.step();
        expect(ensureNode("a").alpha).toBe(0);
        expect(animator.active()).toBe(0);
    });

    test("non unit-anim effects are ignored", () => {
        const { animator, ensureNode } = makeAnimator();
        animator.step();
        animator.play([{ kind: "damage-float", unitId: "a", value: 5, seq: 0 }]);
        const allyNode = ensureNode("a");
        // 飘字意图不影响单位动画：仍停留 idle 首帧
        expect(allyNode.url).toBe(WARRIOR_FRAME_URLS.f.idle[0]);
        expect(animator.active()).toBe(0);
    });

    test("reset returns live units to idle first frame", () => {
        const { animator, ensureNode } = makeAnimator();
        animator.step();
        animator.play([{ kind: "unit-anim", unitId: "a", anim: "attack", seq: 0 }]);
        animator.reset();
        const allyNode = ensureNode("a");
        expect(allyNode.url).toBe(WARRIOR_FRAME_URLS.f.idle[0]);
        expect(animator.active()).toBe(0);
    });
});

describe("Auto-battle unit image node mapping", () => {
    test("loader_unit_{id} resolves to the unit image field (matching UnitSlot.xml loader name)", () => {
        const parsed = AUTO_BATTLE_UNIT_NODE_MAPPING.parse("loader_unit_ally-tank");
        // 解析到 id=ally-tank、field=loader_unit（与 UnitSlot.xml 中 loader name 一致）
        expect(parsed).toEqual({ id: "ally-tank", field: "loader_unit" });
        // 防止 UNIT_IMAGE_NODE 常量与 XML 节点名脱节
        expect(parsed?.field).toBe("loader_unit");
    });
});
