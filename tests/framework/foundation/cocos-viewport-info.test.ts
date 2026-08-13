import { describe, expect, test, mock } from "bun:test";

import { createCcMock } from "./helpers/cc-mock";

// createCocosViewportInfo 经 import * as cc 缺省读 cc.sys/cc.screen/cc.view；
// cc mock 必须与其它测试文件一致（全局共享首个生效）。
mock.module("cc", () => createCcMock());

const { createCocosViewportInfo } = await import("../../../assets/framework/adapters/cocos/viewport/CocosViewportInfo");

describe("createCocosViewportInfo", () => {
    test("sample 返回物理像素与逻辑/CSS 像素（物理 ÷ DPR）", () => {
        const viewport = createCocosViewportInfo({
            view: { getVisibleSizeInPixel: () => ({ width: 1170, height: 2532 }) },
            screen: { devicePixelRatio: 3 },
        });
        const info = viewport.sample();
        expect(info.physical).toEqual({ width: 1170, height: 2532 });
        expect(info.logical).toEqual({ width: 390, height: 844 });
    });

    test("DPR 为 0 或负值时回退 1（不除以 0）", () => {
        const viewport = createCocosViewportInfo({
            view: { getVisibleSizeInPixel: () => ({ width: 800, height: 600 }) },
            screen: { devicePixelRatio: 0 },
        });
        const info = viewport.sample();
        expect(info.logical).toEqual({ width: 800, height: 600 });
    });

    test("readSafeAreaInset 由 getSafeAreaRect 换算四边 inset（设计分辨率坐标系）", () => {
        const viewport = createCocosViewportInfo({
            sys: { getSafeAreaRect: () => ({ x: 20, y: 44, width: 1240, height: 642 }) },
        });
        const inset = viewport.readSafeAreaInset({ width: 1280, height: 720 });
        expect(inset).toEqual({ left: 20, top: 44, right: 20, bottom: 34 });
    });

    test("全屏 safe area 矩形（无刘海）时 inset 全 0", () => {
        const viewport = createCocosViewportInfo({
            sys: { getSafeAreaRect: () => ({ x: 0, y: 0, width: 1280, height: 720 }) },
        });
        const inset = viewport.readSafeAreaInset({ width: 1280, height: 720 });
        expect(inset).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
    });

    test("safe area 超过容器时 inset 钳制为 0（不出现负值）", () => {
        const viewport = createCocosViewportInfo({
            sys: { getSafeAreaRect: () => ({ x: -10, y: 0, width: 1400, height: 800 }) },
        });
        const inset = viewport.readSafeAreaInset({ width: 1280, height: 720 });
        expect(inset.left).toBe(0);
        expect(inset.bottom).toBe(0);
    });
});
