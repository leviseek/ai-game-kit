import { GComponent, GObject, UIPackage } from "fairygui-cc";
import type { GRootLike } from "./CocosUiRoot";
import {
    FRAME_BOTTOM_NODE,
    FRAME_LEFT_NODE,
    FRAME_RIGHT_NODE,
    FRAME_TOP_NODE,
} from "./DevOverlayNodes";

/** 安全区框矩形（GRoot 坐标系，由控制器实时计算输出）。 */
export interface SafeAreaFrameRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface SafeAreaOverlayViewOptions {
    /** 已加载包名（UIPackage 注册名）；缺省 "DevOverlay"。 */
    readonly packageName?: string;
    /** 根容器（GRoot）：把虚线框组件挂到最上层。 */
    readonly root: GRootLike;
    /** 组件创建接缝；缺省 UIPackage.createObject，测试可注入 mock。 */
    readonly createObject?: (packageName: string, resName: string) => GObject | null;
}

/**
 * 安全区虚线框视图句柄：在 Adapter 边界内创建 SafeAreaFrame 组件挂到 GRoot，
 * 按四条边 image 节点名定位并更新位置/尺寸，提供显隐控制与幂等释放。
 * fgui 类型只存在于本文件；dev 层消费本句柄而不直接 import fgui。
 */
export interface SafeAreaOverlayView {
    /** 更新框矩形：四条边按当前 rect 摆放（顶部/底部横跨宽，左/右竖跨高）。 */
    setRect(rect: SafeAreaFrameRect): void;
    /** 显隐：false 时整体隐藏，true 恢复。 */
    setVisible(visible: boolean): void;
    /** 从 GRoot 移除并释放组件。幂等。 */
    dispose(): void;
}

/** 虚线厚度（GRoot 坐标系像素）；四边子图源尺寸应与之对齐。 */
const FRAME_STROKE = 2;

export function createSafeAreaOverlayView(
    options: SafeAreaOverlayViewOptions,
): SafeAreaOverlayView {
    const packageName = options.packageName ?? "DevOverlay";
    const createObject =
        options.createObject ??
        ((pkg: string, res: string) => UIPackage.createObject(pkg, res));
    const component = createObject(packageName, "SafeAreaFrame");

    // 组件创建失败：保留空句柄（无绘制、无显隐），避免组合根抛错中断启动
    let frame: GComponent | undefined;
    if (component instanceof GComponent) {
        frame = component;
        frame.visible = false;
        // 虚线框全屏且 FGUI 组件默认 touchable，显示时会抢走悬浮球的 hover/拖拽
        // 事件（hitTest 命中最上层全屏组件，导致球收不到 TOUCH/ROLL）；显式关闭
        // touchable 让鼠标穿透到下层悬浮球
        frame.touchable = false;
        options.root.addChild(component);
    }

    const edge = (name: string): GObject | undefined =>
        frame?.getChild(name) as GObject | undefined;

    const dispose = (): void => {
        if (frame === undefined) {
            return;
        }
        options.root.removeChild(frame, true);
        frame = undefined;
    };

    return {
        setRect(rect: SafeAreaFrameRect): void {
            if (frame === undefined) {
                return;
            }
            const { x, y, width, height } = rect;
            edge(FRAME_TOP_NODE)?.setPosition(x, y);
            edge(FRAME_TOP_NODE)?.setSize(width, FRAME_STROKE);
            edge(FRAME_BOTTOM_NODE)?.setPosition(x, y + height - FRAME_STROKE);
            edge(FRAME_BOTTOM_NODE)?.setSize(width, FRAME_STROKE);
            edge(FRAME_LEFT_NODE)?.setPosition(x, y);
            edge(FRAME_LEFT_NODE)?.setSize(FRAME_STROKE, height);
            edge(FRAME_RIGHT_NODE)?.setPosition(x + width - FRAME_STROKE, y);
            edge(FRAME_RIGHT_NODE)?.setSize(FRAME_STROKE, height);
        },
        setVisible(visible: boolean): void {
            if (frame !== undefined) {
                frame.visible = visible;
            }
        },
        dispose,
    };
}
