import { director, EventTouch, Node, Touch, Vec3 } from "cc";
import { EnumUiLayer } from "../../framework";
import { createClickableFairyGuiView } from "../../framework/adapters/cocos/ui/FairyGuiPageAdapter";
import type { UiHost } from "../host/UiHost";
import { BUNDLES, PACKAGE_PATHS } from "../constants";

/**
 * 模态遮罩真实交互点击验证序列（引擎集成冒烟驱动）。挂载全屏可点击下层页面
 * 到 normal 层，经导航器进入阻断模态自动呈现遮罩，暴露 CDP 交互钩子；
 * headless Chrome 驱动下注入触摸到 GRoot 根节点，经 fgui 真实命中逻辑断言
 * 模态期间遮罩拦截（点击不穿透下层）、解除后下层恢复。每步经 console 输出
 * `[modal-click]` 标记。
 */
export async function runModalClickSmoke(host: UiHost): Promise<void> {
    const report = (step: string, ok: boolean, detail = "") => {
        console.log(`[modal-click] ${step}: ${ok ? "ok" : "FAIL"}${detail ? ` (${detail})` : ""}`);
    };

    // 1. UI 根与页面适配器初始化
    const ready = host.smokeUiInit();
    report("ui-root-init", ready);
    if (!ready) {
        return;
    }

    // 2. 加载 Demo package（复用资源作用域，验证 package 加载路径不受影响）
    let packageLoaded = false;
    try {
        const handle = await host.loadPackage(BUNDLES.ui, PACKAGE_PATHS.demo);
        packageLoaded = handle.state === "ready";
        report("package-load", packageLoaded, String(handle.state));
    } catch (error) {
        report("package-load", false, error instanceof Error ? error.message : String(error));
    }

    // 3. 挂载全屏可点击下层页面到 normal 层：遮罩在 system 层更上，命中优先
    //    遮罩，下层页面在模态期间收不到点击
    const root = host.root;
    const width = root?.width ?? 1280;
    const height = root?.height ?? 720;
    const container = host.pageAdapter?.containerFor(EnumUiLayer.Normal);
    let underHits = 0;
    if (container === undefined) {
        report("under-mounted", false, "normal layer container not ready");
        return;
    }
    // 冒烟一次性下层视图：直接挂 normal 层容器，不进 adapter pages 登记
    // （无 route 管理需求），随容器在 AppRoot 销毁时一并释放
    const under = createClickableFairyGuiView(
        () => {
            underHits += 1;
            console.log(`[modal-click] under-hit (${underHits})`);
        },
        width,
        height,
    );
    container.addChild(under);
    report("under-mounted", true);

    // 4. 进入阻断模态：遮罩由导航器状态自动呈现
    const opened = host.navigator?.open("modal-click-under", {
        layer: EnumUiLayer.System,
        blocking: true,
    });
    report("modal-active", opened?.ok === true && host.navigator?.modal === true);

    // 5. 暴露 CDP 交互钩子：轮询模态状态、解除模态、读取下层命中数、注入触摸。
    //    tap 与 hitIsUnder 均取 GRoot 中心（rootSize 坐标系），坐标由钩子内部
    //    计算，避免调用方猜测屏幕/设计分辨率映射
    if (typeof window !== "undefined") {
        const center = (): { x: number; y: number } => ({
            x: Math.round((host.root?.width ?? 0) / 2),
            y: Math.round((host.root?.height ?? 0) / 2),
        });
        (window as unknown as Record<string, unknown>).__modalClick = {
            active: () => host.navigator?.modal === true,
            clear: () => host.navigator?.close(),
            underHits: () => underHits,
            // 点击是否命中下层页面：与 fgui InputProcessor 相同坐标转换
            // （screenToWorld + rootSize 高度翻转）后命中测试，等价"点击不穿透"
            hitIsUnder: () => {
                const grNode = (
                    host.root as unknown as {
                        node?: Node;
                    }
                ).node;
                const rootG = host.root as unknown as {
                    height?: number;
                    hitTest?: (ax: number, ay: number, forTouch?: boolean) => unknown;
                };
                const c = center();
                if (grNode === undefined) {
                    return false;
                }
                let hit: unknown;
                const camera = director.root?.batcher2D?.getFirstRenderCamera?.(grNode);
                if (camera !== undefined && camera !== null) {
                    const world = new Vec3();
                    camera.screenToWorld(world, new Vec3(c.x, c.y, 0));
                    hit = rootG.hitTest?.(world.x, (rootG.height ?? 960) - world.y, true);
                } else {
                    hit = rootG.hitTest?.(c.x, c.y, true);
                }
                return hit === under;
            },
            // 应用内触摸注入：向 GRoot.node 派发 cc 触摸流（TOUCH_START + TOUCH_END），
            // 经 fgui InputProcessor 真实命中/遮罩拦截逻辑处理。返回是否注入成功。
            tap: () => {
                const grNode = (
                    host.root as unknown as {
                        node?: Node;
                    }
                ).node;
                if (grNode === undefined) {
                    return false;
                }
                const c = center();
                const touch = new Touch(c.x, c.y);
                const all = [touch];
                grNode.emit(Node.EventType.TOUCH_START, new EventTouch([touch], false, Node.EventType.TOUCH_START, all));
                grNode.emit(Node.EventType.TOUCH_END, new EventTouch([touch], false, Node.EventType.TOUCH_END, all));
                return true;
            },
        };
    }
    console.log("[modal-click] ready");
}

/** 清理 CDP 交互钩子：闭包持有组件与 UI 宿主，常驻根销毁时一并释放。幂等。 */
export function clearModalClickHook(): void {
    if (typeof window !== "undefined") {
        delete (window as unknown as Record<string, unknown>).__modalClick;
    }
}
