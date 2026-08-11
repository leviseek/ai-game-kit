import { describe, expect, test } from "bun:test";

import {
    mountDevOverlay,
    type DevOverlayMountOptions,
} from "../../../assets/boot/dev/dev-overlay";
import type { DevInfoSampler } from "../../../assets/boot/dev/dev-info";
import type { DevOverlayViewSeam } from "../../../assets/boot/dev/dev-overlay";

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

function createFakeView(): DevOverlayViewSeam {
    return {
        ballSize: { width: 48, height: 48 },
        node: () => undefined,
        bindInteraction() { },
        dispose() { },
    };
}

interface SetupResult {
    readonly options: DevOverlayMountOptions;
    readonly root: { readonly width: number; readonly height: number };
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
    const root = { width: 1280, height: 720 };
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
});
