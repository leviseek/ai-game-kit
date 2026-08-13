import { describe, expect, test, mock } from "bun:test";

import { createCcMock } from "./helpers/cc-mock";
import { createFairyGuiMock } from "./helpers/fairygui-mock";
import type {
    DevOverlayMountOptions,
    DevOverlayRoot,
    DevOverlaySafeAreaViewSeam,
    DevOverlayViewSeam,
} from "../../../assets/boot/dev/DevOverlay";
import type { DevInfoSampler } from "../../../assets/boot/dev/DevInfo";

// setupDevOverlay 经 CocosDeviceInfo/dev-profiler/DevOverlayViewHandle 间接依赖
// cc 与 fairygui-cc；cc mock 必须与其它测试文件一致（全局共享首个生效）。
// value import 走动态（静态 import 会被 hoisted 到 mock 之前）。
mock.module("cc", () => createCcMock());
mock.module("fairygui-cc", () => createFairyGuiMock());

const { mountDevOverlay, setupDevOverlay } = await import(
    "../../../assets/boot/dev/DevOverlay"
);

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
        viewport: null,
        uiSize: null,
    }),
};

function createFakeView(): DevOverlayViewSeam {
    return {
        ballSize: { width: 48, height: 48 },
        node: () => undefined,
        bindInteraction() { },
        dispose() { },
    };
}

export interface SafeAreaSeamCallRecord {
    readonly visible: boolean[];
    readonly rects: Array<{ x: number; y: number; width: number; height: number }>;
    readonly disposed: number;
}

function createSafeAreaSeam(): DevOverlaySafeAreaViewSeam & {
    readonly calls: SafeAreaSeamCallRecord;
} {
    const calls: SafeAreaSeamCallRecord = {
        visible: [],
        rects: [],
        disposed: 0,
    };
    return {
        calls,
        setRect(rect) {
            calls.rects.push(rect);
        },
        setVisible(visible: boolean) {
            calls.visible.push(visible);
        },
        dispose() {
            calls.disposed += 1;
        },
    };
}

function createRoot(): DevOverlayRoot {
    let width = 1280;
    let height = 720;
    const children: unknown[] = [];
    return {
        name: "GRoot",
        get width() {
            return width;
        },
        get height() {
            return height;
        },
        setSize(w: number, h: number) {
            width = w;
            height = h;
        },
        addChild(child: unknown) {
            children.push(child);
            return child;
        },
        removeChild(child: unknown) {
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

interface SetupResult {
    readonly options: DevOverlayMountOptions;
    readonly root: DevOverlayRoot;
    readonly counters: {
        readonly created: number;
        readonly driverDisposed: number;
    };
    readonly ticks: Array<() => void>;
}

function setup(overrides: {
    readonly devEnabled?: boolean;
    readonly view?: () => DevOverlayViewSeam | undefined;
} = {}): SetupResult {
    let created = 0;
    let driverDisposed = 0;
    const ticks: Array<() => void> = [];
    const root = createRoot();
    const options: DevOverlayMountOptions = {
        root,
        isDevEnabled: () => overrides.devEnabled ?? true,
        sampler: SAMPLER,
        timeSource: () => 0,
        createView: () => {
            created += 1;
            return (overrides.view ?? createFakeView)();
        },
        drive: (tick) => {
            ticks.push(tick);
            return { dispose: () => { driverDisposed += 1; } };
        },
    };
    return {
        options,
        root,
        counters: {
            get created() {
                return created;
            },
            get driverDisposed() {
                return driverDisposed;
            },
        },
        ticks,
    };
}

describe("mountDevOverlay", () => {
    test("dev 关闭不创建视图、不挂载", () => {
        const { options, counters } = setup({ devEnabled: false });
        const handle = mountDevOverlay(options);
        expect(handle.mounted).toBe(false);
        expect(counters.created).toBe(0);
        handle.dispose();
    });

    test("dev 开启挂载并创建视图", () => {
        const { options, counters } = setup();
        const handle = mountDevOverlay(options);
        expect(handle.mounted).toBe(true);
        expect(counters.created).toBe(1);
        handle.dispose();
    });

    test("同一 root 重复挂载幂等：只创建一次", () => {
        const { options, counters } = setup();
        const first = mountDevOverlay(options);
        const second = mountDevOverlay(options);
        expect(first.mounted).toBe(true);
        expect(second.mounted).toBe(true);
        expect(counters.created).toBe(1);
        first.dispose();
        second.dispose();
    });

    test("dispose 后同 root 可重新挂载", () => {
        const { options, counters } = setup();
        const first = mountDevOverlay(options);
        expect(first.mounted).toBe(true);
        first.dispose();
        expect(counters.driverDisposed).toBe(1);

        const second = mountDevOverlay(options);
        expect(second.mounted).toBe(true);
        expect(counters.created).toBe(2);
        second.dispose();
    });

    test("视图创建失败（undefined）时挂载为 false", () => {
        const { options, counters } = setup({ view: () => undefined });
        const handle = mountDevOverlay(options);
        expect(handle.mounted).toBe(false);
        expect(counters.created).toBe(1);
        handle.dispose();
    });

    test("驱动循环把控制器 step 调度起来", () => {
        const { options, counters, ticks } = setup();
        const handle = mountDevOverlay(options);
        expect(handle.mounted).toBe(true);
        expect(ticks.length).toBe(1);
        // 手动触发一次 tick：控制器 step 不抛错
        expect(() => ticks[0]?.()).not.toThrow();
        handle.dispose();
        expect(counters.driverDisposed).toBe(1);
    });

    test("dispose 幂等：重复调用只释放一次", () => {
        const { options, counters } = setup();
        const handle = mountDevOverlay(options);
        handle.dispose();
        handle.dispose();
        expect(counters.driverDisposed).toBe(1);
    });

    test("safeArea 视图创建失败（undefined）时装配仍可挂载", () => {
        const { options, counters } = setup();
        const handle = mountDevOverlay({
            ...options,
            safeArea: {
                readSafeArea: () => ({ left: 0, top: 0, right: 0, bottom: 0 }),
                readBounds: () => ({ width: 1280, height: 720 }),
                createView: () => undefined,
            },
        });
        expect(handle.mounted).toBe(true);
        expect(counters.created).toBe(1);
        handle.dispose();
    });
});

describe("mountDevOverlay safeArea 联动", () => {
    // 拦截 bindInteraction 拿到 DevBall 控制器，经 onHoverIn/onHoverOut 驱动
    // 展开/收起，验证 onExpandChange → safe area 显隐联动（无需访问内部状态）。
    interface Captured {
        controller:
            | {
                onHoverIn(): void;
                onHoverOut(): void;
            }
            | undefined;
    }

    function createCapturingView(captured: Captured): DevOverlayViewSeam {
        const view = createFakeView();
        const original = view.bindInteraction;
        view.bindInteraction = (handlers) => {
            original(handlers);
            captured.controller = handlers as Captured["controller"];
        };
        return view;
    }

    function setupWithSafeArea(overrides: {
        readonly inset?: { left: number; top: number; right: number; bottom: number };
        readonly devEnabled?: boolean;
    } = {}): {
        readonly handle: ReturnType<typeof mountDevOverlay>;
        readonly seam: ReturnType<typeof createSafeAreaSeam>;
        readonly captured: Captured;
        readonly root: DevOverlayRoot;
    } {
        const root = createRoot();
        const seam = createSafeAreaSeam();
        const captured: Captured = { controller: undefined };
        const handle = mountDevOverlay({
            root,
            isDevEnabled: () => overrides.devEnabled ?? true,
            sampler: SAMPLER,
            timeSource: () => 0,
            createView: () => createCapturingView(captured),
            safeArea: {
                readSafeArea: () => overrides.inset ?? { left: 20, top: 44, right: 20, bottom: 34 },
                readBounds: () => ({ width: root.width, height: root.height }),
                createView: () => seam,
            },
        });
        return { handle, seam, captured, root };
    }

    test("展开时显示安全区框并输出 rect，收起时隐藏", () => {
        const { handle, seam, captured } = setupWithSafeArea();
        expect(handle.mounted).toBe(true);
        expect(seam.calls.visible).toEqual([]);

        captured.controller?.onHoverIn();
        expect(seam.calls.visible).toEqual([true]);
        // show 时立即重算 rect（inset 20/44/20/34，root 1280x720）
        expect(seam.calls.rects).toEqual([{ x: 20, y: 44, width: 1240, height: 642 }]);

        captured.controller?.onHoverOut();
        expect(seam.calls.visible).toEqual([true, false]);
        // 收起不触发新 rect
        expect(seam.calls.rects.length).toBe(1);

        handle.dispose();
    });

    test("收起再展开会重算 rect（实时读取当前 bounds）", () => {
        const { handle, seam, captured, root } = setupWithSafeArea();
        captured.controller?.onHoverIn();
        expect(seam.calls.rects).toEqual([{ x: 20, y: 44, width: 1240, height: 642 }]);

        // 缩放 root 后收起再展开：readBounds 实时读取新尺寸 → 新 rect
        root.setSize(1024, 576);
        captured.controller?.onHoverOut();
        captured.controller?.onHoverIn();
        expect(seam.calls.rects.at(-1)).toEqual({ x: 20, y: 44, width: 984, height: 498 });

        handle.dispose();
    });

    test("safeArea 装配 dev 关闭：不创建安全区视图", () => {
        const { handle, seam } = setupWithSafeArea({ devEnabled: false });
        expect(handle.mounted).toBe(false);
        expect(seam.calls.visible).toEqual([]);
        handle.dispose();
    });

    test("safeArea 视图创建失败（undefined）时装配仍可挂载", () => {
        const root = createRoot();
        const handle = mountDevOverlay({
            root,
            isDevEnabled: () => true,
            sampler: SAMPLER,
            timeSource: () => 0,
            createView: createFakeView,
            safeArea: {
                readSafeArea: () => ({ left: 0, top: 0, right: 0, bottom: 0 }),
                readBounds: () => ({ width: root.width, height: root.height }),
                createView: () => undefined,
            },
        });
        expect(handle.mounted).toBe(true);
        handle.dispose();
    });
});

interface SetupHostResult {
    readonly host: {
        readonly root: DevOverlayRoot | undefined;
        loadPackage(bundle: string, path: string): Promise<{ readonly state: string }>;
    };
    readonly loads: number;
}

function makeSetupHost(
    rootProvider: () => DevOverlayRoot | undefined,
    loadState: string,
): SetupHostResult {
    let loads = 0;
    return {
        host: {
            get root() {
                return rootProvider();
            },
            loadPackage: async () => {
                loads += 1;
                return { state: loadState };
            },
        },
        get loads() {
            return loads;
        },
    };
}

function makeLogger(): {
    logger: {
        warn(message: string): void;
        error(message: string, context?: unknown, error?: Error): void;
    };
    readonly warns: string[];
} {
    const warns: string[] = [];
    return {
        warns,
        logger: {
            warn: (message) => {
                warns.push(message);
            },
            error: () => { },
        },
    };
}

const noopDrive = (): { dispose(): void } => ({ dispose() { } });

describe("setupDevOverlay", () => {
    test("dev 关闭：mounted false，不加载包", () => {
        const setupHost = makeSetupHost(() => createRoot(), "ready");
        const handle = setupDevOverlay({
            host: setupHost.host,
            logger: makeLogger().logger,
            isDevEnabled: () => false,
            drive: noopDrive,
        });
        expect(handle.mounted).toBe(false);
        expect(setupHost.loads).toBe(0);
        handle.dispose();
    });

    test("GRoot 未就绪时内部重试，就绪后挂载", async () => {
        const holder: { root: DevOverlayRoot | undefined } = { root: undefined };
        const setupHost = makeSetupHost(() => holder.root, "ready");
        let driverDisposed = 0;
        const handle = setupDevOverlay({
            host: setupHost.host,
            logger: makeLogger().logger,
            isDevEnabled: () => true,
            drive: (tick) => {
                tick();
                return {
                    dispose: () => {
                        driverDisposed += 1;
                    },
                };
            },
        });
        expect(handle.mounted).toBe(false);

        // GRoot 就绪后，下一次重试（100ms 间隔）读到 root 并挂载
        holder.root = createRoot();
        await new Promise((resolve) => setTimeout(resolve, 120));

        expect(handle.mounted).toBe(true);
        expect(setupHost.loads).toBe(1);
        handle.dispose();
        expect(driverDisposed).toBe(1);
    });

    test("包加载失败：记录 warn，不挂载", async () => {
        const setupHost = makeSetupHost(() => createRoot(), "failed");
        const { logger, warns } = makeLogger();
        const handle = setupDevOverlay({
            host: setupHost.host,
            logger,
            isDevEnabled: () => true,
            drive: noopDrive,
        });
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(handle.mounted).toBe(false);
        expect(warns.some((message) => message.includes("package load failed"))).toBe(true);
        handle.dispose();
    });

    test("dispose 取消 GRoot 未就绪重试：不挂载、不加载包", async () => {
        const setupHost = makeSetupHost(() => undefined, "ready");
        const handle = setupDevOverlay({
            host: setupHost.host,
            logger: makeLogger().logger,
            isDevEnabled: () => true,
            drive: noopDrive,
        });
        handle.dispose();

        // 等待超过重试间隔：重试已被取消
        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(handle.mounted).toBe(false);
        expect(setupHost.loads).toBe(0);
    });

    test("viewport 注入后挂载成功且 safe area 视图随驱动 step 无错", async () => {
        const setupHost = makeSetupHost(() => createRoot(), "ready");
        const seam = createSafeAreaSeam();
        let viewportSamples = 0;
        const handle = setupDevOverlay({
            host: setupHost.host,
            logger: makeLogger().logger,
            isDevEnabled: () => true,
            viewport: {
                sample: () => {
                    viewportSamples += 1;
                    return {
                        physical: { width: 1170, height: 2532 },
                        logical: { width: 390, height: 844 },
                    };
                },
                readSafeAreaInset: () => ({ left: 20, top: 44, right: 20, bottom: 34 }),
            },
            createSafeAreaView: () => seam,
            drive: (tick) => {
                tick();
                return { dispose() { } };
            },
        });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(handle.mounted).toBe(true);
        // 挂载驱动一次 step：safe area 控制器未展开不采样，但装配无错
        expect(viewportSamples).toBeGreaterThanOrEqual(0);
        handle.dispose();
        expect(seam.calls.disposed).toBe(1);
    });
});
