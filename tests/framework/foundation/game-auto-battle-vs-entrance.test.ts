import { describe, expect, test } from "bun:test";
import {
    createVsEntranceTemplate,
    type VsEntranceConfig,
} from "../../../assets/samples/game_auto_battle/view/vs-entrance";
import type { EffectNode } from "../../../assets/samples/game_auto_battle/view/effect-animator";

/** 记录型节点：记录 setter 写入。 */
interface RecordingNode extends EffectNode {
    readonly text: string | undefined;
    readonly alpha: number | undefined;
    readonly xy: { x: number; y: number } | undefined;
}

function recordNode(): RecordingNode {
    const recording: RecordingNode = {
        text: undefined,
        alpha: undefined,
        xy: undefined,
        setText: (v) => { recording.text = v; },
        setAlpha: (v) => { recording.alpha = v; },
        setXY: (x, y) => { recording.xy = { x, y }; },
    };
    return recording;
}

function makeTime() {
    let now = 0;
    return { timeSource: () => now, advance: (ms: number) => { now += ms; } };
}

const DEFAULT_CONFIG: VsEntranceConfig = {
    left: { name: "敌方队长", sideLabel: "敌方" },
    right: { name: "己方队长", sideLabel: "己方" },
    durationMs: 1800,
    holdMs: 600,
    fadeMs: 300,
};

function makeTemplate(config: VsEntranceConfig = DEFAULT_CONFIG) {
    const nodes = new Map<string, RecordingNode>();
    const time = makeTime();
    const template = createVsEntranceTemplate({
        node: (name: string) => nodes.get(name),
        timeSource: time.timeSource,
        config,
    });
    const ensureNode = (name: string): RecordingNode => {
        let node = nodes.get(name);
        if (node === undefined) {
            node = recordNode();
            nodes.set(name, node);
        }
        return node;
    };
    return { template, nodes, ensureNode, advance: time.advance };
}

describe("Auto-battle VS entrance template", () => {
    test("play writes leader names to left/right nodes and VS badge", () => {
        const { template, ensureNode } = makeTemplate();
        const left = ensureNode("vs_left");
        const right = ensureNode("vs_right");
        const badge = ensureNode("vs_badge");
        template.play();
        expect(left.text).toBe("敌方队长");
        expect(right.text).toBe("己方队长");
        expect(badge.text).toBe("VS");
    });

    test("leaders move from sides toward center then hold and fade out", () => {
        const { template, ensureNode, advance } = makeTemplate();
        const left = ensureNode("vs_left");
        const right = ensureNode("vs_right");
        template.play();

        // 起点：两侧偏移（vs_left 在左侧、vs_right 在右侧）
        expect(left.xy!.x).toBeLessThan(0);
        expect(right.xy!.x).toBeGreaterThan(0);

        // 中段：向中心移动
        advance(900);
        template.step();
        expect(left.xy!.x).toBeGreaterThan(-100);
        expect(right.xy!.x).toBeLessThan(100);

        // 结束后：整体淡出（alpha=0）、active 结束
        advance(1800 + 600 + 300);
        template.step();
        expect(left.alpha).toBe(0);
        expect(right.alpha).toBe(0);
        expect(template.active()).toBe(false);
    });

    test("vs badge fades in during play and fades out at end", () => {
        const { template, ensureNode, advance } = makeTemplate();
        const badge = ensureNode("vs_badge");
        template.play();
        expect(badge.alpha).toBe(0);
        advance(900);
        template.step();
        expect(badge.alpha!).toBeGreaterThan(0);
        advance(1800 + 600 + 300);
        template.step();
        expect(badge.alpha).toBe(0);
        expect(template.active()).toBe(false);
    });

    test("reset clears active state", () => {
        const { template, ensureNode } = makeTemplate();
        const left = ensureNode("vs_left");
        template.play();
        template.reset();
        expect(template.active()).toBe(false);
        expect(left.alpha).toBe(0);
    });

    test("duration is configurable", () => {
        const { template, ensureNode, advance } = makeTemplate({
            ...DEFAULT_CONFIG,
            durationMs: 3000,
            holdMs: 1000,
            fadeMs: 500,
        });
        const left = ensureNode("vs_left");
        template.play();
        advance(2000);
        template.step();
        expect(left.alpha!).toBeGreaterThan(0);
        advance(3000 + 1000 + 500);
        template.step();
        expect(left.alpha).toBe(0);
        expect(template.active()).toBe(false);
    });
});
