import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

import { createFairyGuiMock } from "./helpers/fairygui-mock";
import { createUiNavigator, type UiNavigator } from "../../../assets/framework/core/ui/UiNavigator";
import type { UiLayer } from "../../../assets/framework/contracts/ui/Navigation";

// 适配器经 createFairyGuiPageAdapter 工厂间接依赖 fairygui-cc；测试不加载真实
// 运行时，统一使用共享 fixture（bun mock.module 全局共享首个生效）。
mock.module("fairygui-cc", () => createFairyGuiMock());

// ---- 接缝类型（与 fairy-gui-page-adapter.test.ts 对齐的容器接缝形状）----
interface FairyGuiContainerLike {
    name: string;
    readonly width: number;
    readonly height: number;
    addChild(child: unknown): unknown;
    removeChild(child: unknown, dispose?: boolean): unknown;
    removeChildren(beginIndex?: number, endIndex?: number, dispose?: boolean): void;
    getChildAt(index: number): unknown;
    get numChildren(): number;
}

type FairyGuiRootLike = FairyGuiContainerLike;

interface FairyGuiViewLike {
    readonly name: string;
    dispose(): void;
}

// ---- 0.1 目标契约：适配器消费导航器模态状态，导航操作后自动同步遮罩 ----
interface FairyGuiPageAdapterOptions {
    readonly root: FairyGuiRootLike;
    readonly provider?: unknown;
    readonly createView?: (
        packageName: string,
        resName: string,
    ) => FairyGuiViewLike;
    readonly createMask?: (width: number, height: number) => unknown;
    /** 导航器：提供时适配器消费其模态状态，导航阻断自动呈现遮罩、收敛自动移除。 */
    readonly navigator?: UiNavigator;
}

interface FairyGuiPageAdapter {
    init(): void;
    createPage(
        route: string,
        layer: UiLayer,
        options?: { packageName?: string; resName?: string },
    ): unknown;
    mount(page: unknown): void;
    destroy(page: unknown): void;
    setModal(modal: boolean): void;
    dispose(): void;
}

interface FairyGuiPageAdapterFactory {
    createFairyGuiPageAdapter(options: FairyGuiPageAdapterOptions): FairyGuiPageAdapter;
}

const projectRoot = resolve(import.meta.dir, "../../..");
const adapterFile = resolve(
    projectRoot,
    "assets/framework/adapters/cocos/ui/FairyGuiPageAdapter.ts",
);

async function loadFactory(): Promise<FairyGuiPageAdapterFactory> {
    const exports = (await import(
        pathToFileURL(adapterFile).href
    )) as Partial<FairyGuiPageAdapterFactory>;

    expect(typeof exports.createFairyGuiPageAdapter).toBe("function");

    return {
        createFairyGuiPageAdapter:
            exports.createFairyGuiPageAdapter as FairyGuiPageAdapterFactory["createFairyGuiPageAdapter"],
    };
}

// ---- 记录型 root mock：跟踪 system 层遮罩的添加/移除 ----
interface ContainerCall {
    readonly container: string;
    readonly action: string;
    readonly child?: unknown;
}

function createRecordingRoot(): {
    readonly root: FairyGuiRootLike;
    readonly calls: ContainerCall[];
    readonly containers: Map<string, FairyGuiContainerLike>;
} {
    const calls: ContainerCall[] = [];
    const containers = new Map<string, FairyGuiContainerLike>();

    function makeContainer(name: string): FairyGuiContainerLike {
        const children: unknown[] = [];
        return {
            name,
            width: 1280,
            height: 720,
            addChild(child) {
                children.push(child);
                calls.push({ container: name, action: "addChild", child });
                return child;
            },
            removeChild(child, _dispose = false) {
                const index = children.indexOf(child);
                if (index >= 0) {
                    children.splice(index, 1);
                }
                calls.push({ container: name, action: "removeChild", child });
                return child;
            },
            removeChildren(beginIndex = 0, endIndex?: number, _dispose = false) {
                const toRemove = children.splice(beginIndex, endIndex);
                calls.push({
                    container: name,
                    action: "removeChildren",
                    child: toRemove,
                });
            },
            getChildAt(index) {
                return children[index];
            },
            get numChildren() {
                return children.length;
            },
        };
    }

    const root: FairyGuiRootLike = {
        name: "GRoot",
        width: 1280,
        height: 720,
        addChild(child) {
            calls.push({ container: "GRoot", action: "addChild", child });
            const name = (child as { name?: string } | undefined)?.name ?? "unknown";
            const container = makeContainer(name);
            containers.set(name, container);
            return container;
        },
        removeChild(child, _dispose = false) {
            calls.push({ container: "GRoot", action: "removeChild", child });
            return child;
        },
        removeChildren(_beginIndex = 0, _endIndex?: number, _dispose = false) {
            calls.push({ container: "GRoot", action: "removeChildren" });
        },
        getChildAt(_index: number) {
            return undefined;
        },
        get numChildren() {
            return 0;
        },
    };

    return { root, calls, containers };
}

function findContainerCalls(
    calls: readonly ContainerCall[],
    containerName: string,
    action: string,
): ContainerCall[] {
    return calls.filter(
        (call) => call.container === containerName && call.action === action,
    );
}

async function makeAutoSyncAdapter(): Promise<{
    navigator: UiNavigator;
    recording: ReturnType<typeof createRecordingRoot>;
    adapter: FairyGuiPageAdapter;
}> {
    const { createFairyGuiPageAdapter } = await loadFactory();
    const navigator = createUiNavigator();
    const recording = createRecordingRoot();
    const adapter = createFairyGuiPageAdapter({
        root: recording.root,
        navigator,
        createView: () => ({ name: "view", dispose: () => { } }),
    });
    adapter.init();
    return { navigator, recording, adapter };
}

describe("navigator modal auto-sync", () => {
    test("navigator modal state automatically presents and removes the mask without manual setModal", async () => {
        const { navigator, recording } = await makeAutoSyncAdapter();

        // 未进模态：system 层无遮罩
        expect(findContainerCalls(recording.calls, "system", "addChild")).toHaveLength(0);

        // 打开阻断页面：导航模态状态成立，遮罩自动呈现（组合根无需手动 setModal）
        const opened = navigator.open("modal", { layer: "popup", blocking: true });
        expect(opened.ok).toBe(true);
        expect(navigator.modal).toBe(true);
        const maskCalls = findContainerCalls(recording.calls, "system", "addChild");
        expect(maskCalls).toHaveLength(1);
        expect(recording.containers.get("system")?.numChildren).toBe(1);

        // 关闭阻断页面：模态收敛，遮罩自动移除
        navigator.close();
        expect(navigator.modal).toBe(false);
        expect(
            findContainerCalls(recording.calls, "system", "removeChild"),
        ).toHaveLength(1);
        expect(recording.containers.get("system")?.numChildren).toBe(0);
    });

    test("repeat modal enter/exit is idempotent (single mask, single removal)", async () => {
        const { navigator, recording } = await makeAutoSyncAdapter();

        // 连续两次进入阻断：只呈现一个遮罩，不重复添加
        navigator.open("a", { layer: "popup", blocking: true });
        navigator.open("b", { layer: "popup", blocking: true });
        expect(findContainerCalls(recording.calls, "system", "addChild")).toHaveLength(1);

        // 仍有阻断页面在栈顶时，遮罩保留
        navigator.close();
        expect(navigator.modal).toBe(true);
        expect(
            findContainerCalls(recording.calls, "system", "removeChild"),
        ).toHaveLength(0);

        // 关闭最后一个阻断页面：遮罩仅移除一次
        navigator.close();
        expect(navigator.modal).toBe(false);
        expect(
            findContainerCalls(recording.calls, "system", "removeChild"),
        ).toHaveLength(1);
        expect(recording.containers.get("system")?.numChildren).toBe(0);

        // 空栈重复关闭被拒绝：不产生额外移除，保持幂等
        navigator.close();
        expect(
            findContainerCalls(recording.calls, "system", "removeChild"),
        ).toHaveLength(1);
    });

    test("non-blocking pages do not present the mask", async () => {
        const { navigator, recording } = await makeAutoSyncAdapter();

        navigator.open("normal", { layer: "normal" });
        expect(navigator.modal).toBe(false);
        expect(findContainerCalls(recording.calls, "system", "addChild")).toHaveLength(0);

        navigator.close();
        expect(
            findContainerCalls(recording.calls, "system", "removeChild"),
        ).toHaveLength(0);
    });

    test("disposing the adapter stops the auto-sync (later navigation no longer drives the mask)", async () => {
        const { navigator, recording, adapter } = await makeAutoSyncAdapter();

        adapter.dispose();
        navigator.open("modal", { layer: "popup", blocking: true });
        expect(navigator.modal).toBe(true);
        expect(findContainerCalls(recording.calls, "system", "addChild")).toHaveLength(0);
    });

    test("disposing the navigator converges the modal and removes the mask", async () => {
        const { navigator, recording } = await makeAutoSyncAdapter();

        navigator.open("modal", { layer: "popup", blocking: true });
        expect(findContainerCalls(recording.calls, "system", "addChild")).toHaveLength(1);

        // 导航器释放：栈清空、模态收敛，遮罩经包装的 dispose 自动移除
        navigator.dispose();
        expect(navigator.modal).toBe(false);
        expect(
            findContainerCalls(recording.calls, "system", "removeChild"),
        ).toHaveLength(1);
        expect(recording.containers.get("system")?.numChildren).toBe(0);
    });

    test("disposing the adapter restores the navigator's original methods", async () => {
        const { createFairyGuiPageAdapter } = await loadFactory();
        const navigator = createUiNavigator();
        const originalOpen = navigator.open;
        const recording = createRecordingRoot();
        const adapter = createFairyGuiPageAdapter({
            root: recording.root,
            navigator,
            createView: () => ({ name: "view", dispose: () => { } }),
        });
        adapter.init();

        // 包装生效：适配器持有期间 navigator.open 已替换为同步包装
        expect(navigator.open).not.toBe(originalOpen);

        adapter.dispose();
        // 恢复原始方法：导航器不再被已释放适配器劫持
        expect(navigator.open).toBe(originalOpen);
    });

    test("the mask follows modal state across back navigation as well", async () => {
        const { navigator, recording } = await makeAutoSyncAdapter();

        // 非阻断页在下、阻断页在上：back 弹出阻断页后模态收敛
        navigator.open("base", { layer: "normal" });
        navigator.open("modal", { layer: "popup", blocking: true });
        expect(findContainerCalls(recording.calls, "system", "addChild")).toHaveLength(1);

        navigator.back();
        expect(navigator.modal).toBe(false);
        expect(
            findContainerCalls(recording.calls, "system", "removeChild"),
        ).toHaveLength(1);
        expect(recording.containers.get("system")?.numChildren).toBe(0);
    });
});
