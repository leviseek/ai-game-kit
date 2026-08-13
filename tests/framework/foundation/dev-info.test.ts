import { describe, expect, test } from "bun:test";

import { createDevInfoSampler, effectiveType, formatUptime } from "../../../assets/boot/dev/DevInfo";
import type { DeviceInfo, TimeSource } from "../../../assets/framework";
import type { PerfSampler } from "../../../assets/game/fixture/perf";

function makeClock(start: number): { clock: TimeSource; advance(ms: number): void } {
    let value = start;
    return {
        clock: { now: () => value },
        advance(ms: number) {
            value += ms;
        },
    };
}

const DEVICE: DeviceInfo = {
    platform: "Windows",
    model: "desktop",
    language: "en",
};

describe("formatUptime", () => {
    test("格式化为 mm:ss 并补零", () => {
        expect(formatUptime(0)).toBe("00:00");
        expect(formatUptime(5_000)).toBe("00:05");
        expect(formatUptime(61_000)).toBe("01:01");
        expect(formatUptime(725_000)).toBe("12:05");
        expect(formatUptime(3_600_000)).toBe("60:00");
    });

    test("负数钳制为 0", () => {
        expect(formatUptime(-1_000)).toBe("00:00");
    });
});

describe("effectiveType", () => {
    test("connection 缺失降级 unknown", () => {
        expect(effectiveType(undefined)).toBe("unknown");
    });

    test("connection 为 null 降级 unknown", () => {
        expect(effectiveType(null)).toBe("unknown");
    });

    test("effectiveType 为空串降级 unknown", () => {
        expect(effectiveType({ effectiveType: "" })).toBe("unknown");
    });

    test("返回 effectiveType", () => {
        expect(effectiveType({ effectiveType: "4g" })).toBe("4g");
    });
});

describe("createDevInfoSampler", () => {
    test("运行时间从创建起点差值计算并格式化", () => {
        const { clock, advance } = makeClock(1_000_000);
        const sampler = createDevInfoSampler({ clock, device: DEVICE });
        advance(65_000);
        const info = sampler.sample();
        expect(info.uptime).toBe("01:05");
    });

    test("平台/型号/语言来自 DeviceInfo", () => {
        const sampler = createDevInfoSampler({ clock: { now: () => 0 }, device: DEVICE });
        const info = sampler.sample();
        expect(info.platform).toBe("Windows");
        expect(info.model).toBe("desktop");
        expect(info.language).toBe("en");
    });

    test("网络状态与 effectiveType 来自 navigator 接缝", () => {
        const sampler = createDevInfoSampler({
            clock: { now: () => 0 },
            device: DEVICE,
            navigator: { onLine: true, connection: { effectiveType: "4g" } },
        });
        const info = sampler.sample();
        expect(info.online).toBe(true);
        expect(info.networkType).toBe("4g");
    });

    test("离线且 connection 缺失时降级 unknown", () => {
        const sampler = createDevInfoSampler({
            clock: { now: () => 0 },
            device: DEVICE,
            navigator: { onLine: false, connection: null },
        });
        const info = sampler.sample();
        expect(info.online).toBe(false);
        expect(info.networkType).toBe("unknown");
    });

    test("navigator 缺省视为离线 unknown（注入确定性）", () => {
        const sampler = createDevInfoSampler({
            clock: { now: () => 0 },
            device: DEVICE,
            navigator: { onLine: false },
        });
        const info = sampler.sample();
        expect(info.online).toBe(false);
        expect(info.networkType).toBe("unknown");
    });

    test("perf 采样器数值映射到 fps 与内存", () => {
        const perf: PerfSampler = () => ({
            fps: 60,
            frameMs: 16,
            logicMs: 5,
            draws: 100,
            textureMemoryMB: 12.3,
            bufferMemoryMB: 4.2,
        });
        const sampler = createDevInfoSampler({ clock: { now: () => 0 }, device: DEVICE, perf });
        const info = sampler.sample();
        expect(info.fps).toBe(60);
        expect(info.textureMemoryMB).toBe(12.3);
        expect(info.bufferMemoryMB).toBe(4.2);
    });

    test("perf 未注入时数值字段为 null", () => {
        const sampler = createDevInfoSampler({ clock: { now: () => 0 }, device: DEVICE });
        const info = sampler.sample();
        expect(info.fps).toBeNull();
        expect(info.textureMemoryMB).toBeNull();
        expect(info.bufferMemoryMB).toBeNull();
    });

    test("perf 采样器返回 null 时数值字段为 null", () => {
        const perf: PerfSampler = () => null;
        const sampler = createDevInfoSampler({ clock: { now: () => 0 }, device: DEVICE, perf });
        const info = sampler.sample();
        expect(info.fps).toBeNull();
        expect(info.textureMemoryMB).toBeNull();
    });

    test("viewport/uiSize 读取器注入生效（实时调用）", () => {
        const sampler = createDevInfoSampler({
            clock: { now: () => 0 },
            device: DEVICE,
            readViewport: () => ({
                physical: { width: 1170, height: 2532 },
                logical: { width: 390, height: 844 },
            }),
            readUiSize: () => ({ width: 1280, height: 720 }),
        });
        const info = sampler.sample();
        expect(info.viewport).toEqual({
            physical: { width: 1170, height: 2532 },
            logical: { width: 390, height: 844 },
        });
        expect(info.uiSize).toEqual({ width: 1280, height: 720 });
    });

    test("viewport/uiSize 读取器未注入时字段为 null", () => {
        const sampler = createDevInfoSampler({ clock: { now: () => 0 }, device: DEVICE });
        const info = sampler.sample();
        expect(info.viewport).toBeNull();
        expect(info.uiSize).toBeNull();
    });
});
