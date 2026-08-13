import { describe, expect, test, mock } from "bun:test";

import { createCcMock } from "./helpers/cc-mock";
import { createFairyGuiMock } from "./helpers/fairygui-mock";

mock.module("cc", () => createCcMock());
mock.module("fairygui-cc", () => createFairyGuiMock());

const { GComponent } = await import("fairygui-cc");
const { createSafeAreaOverlayView } = await import("../../../assets/framework/adapters/cocos/ui/SafeAreaOverlayViewHandle");
import type { GRootLike } from "../../../assets/framework/adapters/cocos/ui/CocosUiRoot";

interface EdgeRecord {
    readonly name: string;
    position: { x: number; y: number } | undefined;
    size: { width: number; height: number } | undefined;
    visible: boolean;
}

function makeEdge(name: string): EdgeRecord & {
    setPosition(x: number, y: number): void;
    setSize(width: number, height: number): void;
} {
    return {
        name,
        position: undefined,
        size: undefined,
        visible: true,
        setPosition(x: number, y: number) {
            this.position = { x, y };
        },
        setSize(width: number, height: number) {
            this.size = { width, height };
        },
    };
}

function createRoot(): GRootLike {
    const children: unknown[] = [];
    return {
        name: "GRoot",
        width: 1280,
        height: 720,
        setSize() {},
        addChild(child: unknown) {
            children.push(child);
            return child;
        },
        removeChild(child: unknown, _dispose?: boolean) {
            const index = children.indexOf(child);
            if (index >= 0) {
                children.splice(index, 1);
            }
            return child;
        },
        removeChildren() {
            children.length = 0;
        },
        getChildAt(index: number) {
            return children[index];
        },
        get numChildren() {
            return children.length;
        },
    };
}

interface Harness {
    readonly root: GRootLike;
    readonly component: InstanceType<typeof GComponent>;
    readonly edges: Record<
        string,
        EdgeRecord & {
            setPosition(x: number, y: number): void;
            setSize(width: number, height: number): void;
        }
    >;
    view: ReturnType<typeof createSafeAreaOverlayView>;
}

function setup(): Harness {
    const root = createRoot();
    const edges = {
        frame_top: makeEdge("frame_top"),
        frame_bottom: makeEdge("frame_bottom"),
        frame_left: makeEdge("frame_left"),
        frame_right: makeEdge("frame_right"),
    };
    const component = new GComponent();
    for (const edge of Object.values(edges)) {
        component.addChild(edge);
    }
    const view = createSafeAreaOverlayView({
        root,
        createObject: () => component,
    });
    return { root, component, edges, view };
}

describe("createSafeAreaOverlayView", () => {
    test("创建时挂到 GRoot 并默认隐藏", () => {
        const { root, component, view } = setup();
        expect(root.numChildren).toBe(1);
        expect(component.visible).toBe(false);
        view.dispose();
    });

    test("setRect 按四边摆放位置与尺寸（顶部/底部横跨宽，左/右竖跨高）", () => {
        const { edges, view } = setup();
        view.setRect({ x: 20, y: 44, width: 1240, height: 642 });
        expect(edges.frame_top.position).toEqual({ x: 20, y: 44 });
        expect(edges.frame_top.size).toEqual({ width: 1240, height: 2 });
        expect(edges.frame_bottom.position).toEqual({ x: 20, y: 44 + 642 - 2 });
        expect(edges.frame_bottom.size).toEqual({ width: 1240, height: 2 });
        expect(edges.frame_left.position).toEqual({ x: 20, y: 44 });
        expect(edges.frame_left.size).toEqual({ width: 2, height: 642 });
        expect(edges.frame_right.position).toEqual({ x: 20 + 1240 - 2, y: 44 });
        expect(edges.frame_right.size).toEqual({ width: 2, height: 642 });
        view.dispose();
    });

    test("创建时 touchable 设为 false：全屏虚线框不拦截鼠标，悬浮球 hover/拖拽可穿透", () => {
        const root = createRoot();
        const component = new GComponent();
        // 真实 FGUI 组件默认 touchable=true，全屏覆盖 GRoot 时会抢走悬浮球事件
        component.touchable = true;
        const view = createSafeAreaOverlayView({
            root,
            createObject: () => component,
        });
        expect(component.touchable).toBe(false);
        view.dispose();
    });

    test("setVisible 控制组件显隐", () => {
        const { component, view } = setup();
        view.setVisible(true);
        expect(component.visible).toBe(true);
        view.setVisible(false);
        expect(component.visible).toBe(false);
        view.dispose();
    });

    test("dispose 从 GRoot 移除并幂等", () => {
        const { root, view } = setup();
        view.dispose();
        expect(root.numChildren).toBe(0);
        view.dispose();
        expect(root.numChildren).toBe(0);
    });

    test("组件创建失败（undefined）时保留空句柄：setRect/setVisible/dispose 不抛错", () => {
        const root = createRoot();
        const view = createSafeAreaOverlayView({ root, createObject: () => null });
        expect(() => {
            view.setRect({ x: 0, y: 0, width: 100, height: 100 });
            view.setVisible(true);
            view.dispose();
        }).not.toThrow();
        expect(root.numChildren).toBe(0);
    });
});
