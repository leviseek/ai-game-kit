import { describe, expect, test } from "bun:test";

import {
    BADGE_FPS_NODE,
    BALL_NODE,
    INFO_UPTIME_NODE,
    PANEL_NODE,
    computeSnapTarget,
    createDevBallController,
    type DevBallController,
} from "../../../assets/boot/dev/dev-ball";
import type { DevInfoSampler } from "../../../assets/boot/dev/dev-info";
import type { ViewModelNode } from "../../../assets/framework";

interface NodeWrites {
    text?: string;
    visible?: boolean;
    alpha?: number;
    xy?: { x: number; y: number };
}

function createFakeNodes(): {
    node: (name: string) => ViewModelNode | undefined;
    writes: Record<string, NodeWrites>;
} {
    const writes: Record<string, NodeWrites> = {};
    const node = (name: string): ViewModelNode | undefined => {
        let current = writes[name];
        if (current === undefined) {
            current = {};
            writes[name] = current;
        }
        return {
            setText(value: string) {
                current.text = value;
            },
            setProgress() { },
            setVisible(value: boolean) {
                current.visible = value;
            },
            onClick() { },
            setXY(x: number, y: number) {
                current.xy = { x, y };
            },
            setAlpha(value: number) {
                current.alpha = value;
            },
        };
    };
    return { node, writes };
}

function makeClock(start = 0): {
    timeSource: () => number;
    advance(ms: number): void;
} {
    let value = start;
    return {
        timeSource: () => value,
        advance(ms: number) {
            value += ms;
        },
    };
}

const SAMPLER: DevInfoSampler = {
    sample: () => ({
        uptime: "01:00",
        platform: "Windows",
        model: "desktop",
        language: "en",
        online: true,
        networkType: "4g",
        fps: 60,
        textureMemoryMB: 12,
        bufferMemoryMB: 4,
    }),
};

const BALL_SIZE = { width: 48, height: 48 };
const BOUNDS = { width: 1280, height: 720 };

function makeController(
    initial?: { x: number; y: number },
    extra?: { readonly onTap?: () => void },
): {
    controller: DevBallController;
    nodes: ReturnType<typeof createFakeNodes>;
    clock: ReturnType<typeof makeClock>;
} {
    const nodes = createFakeNodes();
    const clock = makeClock(1000);
    const controller = createDevBallController({
        node: nodes.node,
        ballSize: BALL_SIZE,
        readBounds: () => BOUNDS,
        timeSource: clock.timeSource,
        sampler: SAMPLER,
        ...(initial === undefined ? {} : { initialPosition: initial }),
        ...(extra === undefined ? {} : extra),
    });
    return { controller, nodes, clock };
}

describe("computeSnapTarget", () => {
    test("无论拖到哪都固定贴回左侧：球完整可见（不露头）", () => {
        expect(computeSnapTarget({ x: 1200, y: 300 }, BALL_SIZE, BOUNDS)).toEqual({ x: 0, y: 300 });
        expect(computeSnapTarget({ x: 10, y: 300 }, BALL_SIZE, BOUNDS)).toEqual({ x: 0, y: 300 });
        expect(computeSnapTarget({ x: 640, y: 10 }, BALL_SIZE, BOUNDS)).toEqual({ x: 0, y: 10 });
    });

    test("y 保留并钳制在设计分辨率边界内", () => {
        expect(computeSnapTarget({ x: 100, y: 800 }, BALL_SIZE, BOUNDS)).toEqual({ x: 0, y: 672 });
        expect(computeSnapTarget({ x: 100, y: -100 }, BALL_SIZE, BOUNDS)).toEqual({ x: 0, y: 0 });
    });
});

describe("createDevBallController", () => {
    test("默认初始位置：左上角完整可见（贴左贴顶，FPS 徽标完整）", () => {
        const { controller, nodes } = makeController();
        expect(controller.state).toBe("collapsed");
        expect(nodes.writes[BALL_NODE].xy).toEqual({ x: 0, y: 0 });
        expect(nodes.writes[PANEL_NODE].visible).toBe(false);
    });

    test("初始收缩态：球定位到注入的初始位置，面板隐藏", () => {
        const { controller, nodes } = makeController({ x: 300, y: 200 });
        expect(controller.state).toBe("collapsed");
        expect(nodes.writes[BALL_NODE].xy).toEqual({ x: 300, y: 200 });
        expect(nodes.writes[PANEL_NODE].visible).toBe(false);
    });

    test("拖动链路 collapsed → dragging → snapping → collapsed（释放回左侧）", () => {
        const { controller, nodes, clock } = makeController({ x: 300, y: 200 });
        controller.onTouchBegin(310, 210);
        expect(controller.state).toBe("dragging");

        controller.onTouchMove(200, 300);
        expect(nodes.writes[BALL_NODE].xy).toEqual({ x: 190, y: 290 });

        controller.onTouchEnd();
        expect(controller.state).toBe("snapping");

        clock.advance(400);
        controller.step();
        expect(controller.state).toBe("collapsed");
        // 释放后固定贴回左侧（球完整可见，y 保留拖动位置）
        expect(nodes.writes[BALL_NODE].xy).toEqual({ x: 0, y: 290 });
    });

    test("拖动中不吸附：step 不改变球位置", () => {
        const { controller, nodes, clock } = makeController();
        controller.onTouchBegin(310, 210);
        controller.onTouchMove(500, 300);
        const before = nodes.writes[BALL_NODE].xy;

        clock.advance(400);
        controller.step();

        expect(controller.state).toBe("dragging");
        expect(nodes.writes[BALL_NODE].xy).toEqual(before);
    });

    test("轻点（无位移）不改变状态，仅触发预留 onTap 回调", () => {
        const taps: string[] = [];
        const { controller } = makeController(undefined, {
            onTap: () => {
                taps.push("tap");
            },
        });
        expect(controller.state).toBe("collapsed");

        controller.onTouchBegin(310, 210);
        controller.onTouchEnd();

        expect(controller.state).toBe("collapsed");
        expect(taps).toEqual(["tap"]);
    });

    test("悬停展开，移出后收起（鼠标分支）", () => {
        const { controller } = makeController();
        controller.onHoverIn();
        expect(controller.state).toBe("expanded");
        controller.onHoverOut();
        expect(controller.state).toBe("collapsed");
    });

    test("悬停展开后点击不锁定，移出仍收起", () => {
        const { controller } = makeController();
        controller.onHoverIn();
        expect(controller.state).toBe("expanded");

        controller.onTouchBegin(310, 210);
        controller.onTouchEnd();
        expect(controller.state).toBe("expanded");

        controller.onHoverOut();
        expect(controller.state).toBe("collapsed");
    });

    test("从展开态拖动会收起并贴边", () => {
        const { controller, nodes, clock } = makeController();
        controller.onHoverIn();
        expect(controller.state).toBe("expanded");

        controller.onTouchBegin(310, 210);
        controller.onTouchMove(500, 300);
        controller.onTouchEnd();
        expect(controller.state).toBe("snapping");

        clock.advance(400);
        controller.step();
        expect(controller.state).toBe("collapsed");
        expect(nodes.writes[PANEL_NODE].visible).toBe(false);
    });

    test("展开态面板淡入：alpha 0→1 插值", () => {
        const { controller, nodes, clock } = makeController();
        controller.onHoverIn();
        expect(nodes.writes[PANEL_NODE].visible).toBe(true);

        clock.advance(90);
        controller.step();
        const midAlpha = nodes.writes[PANEL_NODE].alpha;
        expect(midAlpha).toBeGreaterThan(0);
        expect(midAlpha).toBeLessThan(1);

        clock.advance(200);
        controller.step();
        expect(nodes.writes[PANEL_NODE].alpha).toBe(1);
    });

    test("收起面板淡出后隐藏", () => {
        const { controller, nodes, clock } = makeController();
        controller.onHoverIn();
        clock.advance(200);
        controller.step();
        expect(nodes.writes[PANEL_NODE].alpha).toBe(1);

        controller.onHoverOut();
        expect(controller.state).toBe("collapsed");

        clock.advance(200);
        controller.step();
        expect(nodes.writes[PANEL_NODE].alpha).toBe(0);
        expect(nodes.writes[PANEL_NODE].visible).toBe(false);
    });

    test("面板淡出中被拖拽打断：立即完成隐藏，不残留半透明", () => {
        const { controller, nodes, clock } = makeController();
        controller.onHoverIn();
        clock.advance(200);
        controller.step();
        expect(nodes.writes[PANEL_NODE].alpha).toBe(1);

        // 开始淡出但未完成
        controller.onHoverOut();
        clock.advance(90);
        controller.step();
        expect(nodes.writes[PANEL_NODE].alpha).toBeGreaterThan(0);

        // 淡出中按下拖动 → 面板立即完成隐藏，不残留半透明
        controller.onTouchBegin(310, 210);
        expect(nodes.writes[PANEL_NODE].visible).toBe(false);
        expect(nodes.writes[PANEL_NODE].alpha).toBe(0);

        controller.onTouchMove(200, 300);
        controller.onTouchEnd();
        expect(controller.state).toBe("snapping");
        clock.advance(400);
        controller.step();
        expect(controller.state).toBe("collapsed");
        expect(nodes.writes[PANEL_NODE].visible).toBe(false);
    });

    test("淡入中收起：从当前 alpha 淡出，不闪回 1", () => {
        const { controller, nodes, clock } = makeController();
        controller.onHoverIn();
        clock.advance(90);
        controller.step();
        const mid = nodes.writes[PANEL_NODE].alpha;
        expect(mid).toBeGreaterThan(0);
        expect(mid).toBeLessThan(1);

        controller.onHoverOut();
        clock.advance(10);
        controller.step();
        expect(nodes.writes[PANEL_NODE].alpha).toBeLessThan(mid);
    });

    test("拖动中位置钳制在设计分辨率边界内", () => {
        const { controller, nodes } = makeController({ x: 100, y: 100 });
        controller.onTouchBegin(110, 110);
        controller.onTouchMove(2000, 2000);
        // BOUNDS 1280x720，球 48x48 → maxX=1232, maxY=672
        expect(nodes.writes[BALL_NODE].xy).toEqual({ x: 1232, y: 672 });
    });

    test("边界实时读取：窗口 resize 后钳制使用新边界", () => {
        let width = 1280;
        let height = 720;
        const nodes = createFakeNodes();
        const clock = makeClock(1000);
        const controller = createDevBallController({
            node: nodes.node,
            ballSize: BALL_SIZE,
            readBounds: () => ({ width, height }),
            timeSource: clock.timeSource,
            sampler: SAMPLER,
            initialPosition: { x: 100, y: 100 },
        });

        // 模拟窗口 resize 缩小
        width = 640;
        height = 360;
        controller.onTouchBegin(110, 110);
        controller.onTouchMove(2000, 2000);
        // 新边界：maxX=592, maxY=312
        expect(nodes.writes[BALL_NODE].xy).toEqual({ x: 592, y: 312 });
    });

    test("收缩态低频刷新 FPS 徽标", () => {
        const { controller, nodes, clock } = makeController();
        clock.advance(600);
        controller.step();
        expect(nodes.writes[BADGE_FPS_NODE].text).toBe("60");
    });

    test("展开态刷新全量信息", () => {
        const { controller, nodes } = makeController();
        controller.onHoverIn();
        expect(nodes.writes[INFO_UPTIME_NODE].text).toBe("01:00");
    });
});
