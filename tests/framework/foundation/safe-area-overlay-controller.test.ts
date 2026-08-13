import { describe, expect, test } from "bun:test";

import {
    computeSafeAreaRect,
    createSafeAreaOverlayController,
    type SafeAreaOverlayController,
    type SafeAreaRect,
} from "../../../assets/boot/dev/SafeAreaOverlayController";

interface CallRecord {
    readonly rects: SafeAreaRect[];
    readonly visible: boolean[];
}

function makeHarness(
    readSafeArea: () => { left: number; top: number; right: number; bottom: number },
    readBounds: () => { width: number; height: number },
): {
    controller: SafeAreaOverlayController;
    record: CallRecord;
} {
    const record: CallRecord = { rects: [], visible: [] };
    const controller = createSafeAreaOverlayController({
        readSafeArea,
        readBounds,
        timeSource: () => 0,
        onRect: (rect) => {
            record.rects.push(rect);
        },
        onVisible: (visible) => {
            record.visible.push(visible);
        },
    });
    return { controller, record };
}

describe("computeSafeAreaRect", () => {
    test("inset 四边换算为框矩形", () => {
        const rect = computeSafeAreaRect(
            { left: 20, top: 44, right: 20, bottom: 34 },
            { width: 1280, height: 720 },
        );
        expect(rect).toEqual({ x: 20, y: 44, width: 1240, height: 642 });
    });

    test("inset 全 0 时框覆盖整个容器", () => {
        const rect = computeSafeAreaRect(
            { left: 0, top: 0, right: 0, bottom: 0 },
            { width: 1280, height: 720 },
        );
        expect(rect).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
    });

    test("inset 超过容器尺寸时宽度/高度钳制为 0（不出现负值）", () => {
        const rect = computeSafeAreaRect(
            { left: 1000, top: 100, right: 1000, bottom: 100 },
            { width: 1280, height: 720 },
        );
        expect(rect.width).toBe(0);
        expect(rect.height).toBe(520);
    });
});

describe("createSafeAreaOverlayController", () => {
    test("show 触发 onVisible(true) 并输出当前 rect", () => {
        const { controller, record } = makeHarness(
            () => ({ left: 20, top: 44, right: 20, bottom: 34 }),
            () => ({ width: 1280, height: 720 }),
        );
        controller.show();
        expect(record.visible).toEqual([true]);
        expect(record.rects).toEqual([{ x: 20, y: 44, width: 1240, height: 642 }]);
    });

    test("hide 触发 onVisible(false)，不输出 rect", () => {
        const { controller, record } = makeHarness(
            () => ({ left: 0, top: 0, right: 0, bottom: 0 }),
            () => ({ width: 1280, height: 720 }),
        );
        controller.show();
        controller.hide();
        expect(record.visible).toEqual([true, false]);
        expect(record.rects.length).toBe(1);
    });

    test("值未变化时 step 不重复触发 onRect（脏检查）", () => {
        const { controller, record } = makeHarness(
            () => ({ left: 20, top: 44, right: 20, bottom: 34 }),
            () => ({ width: 1280, height: 720 }),
        );
        controller.show();
        const before = record.rects.length;
        controller.step();
        controller.step();
        expect(record.rects.length).toBe(before);
    });

    test("屏幕缩放后 step 触发 onRect（跟随 resize）", () => {
        let bounds = { width: 1280, height: 720 };
        const { controller, record } = makeHarness(
            () => ({ left: 20, top: 44, right: 20, bottom: 34 }),
            () => bounds,
        );
        controller.show();
        bounds = { width: 1024, height: 576 };
        controller.step();
        expect(record.rects.at(-1)).toEqual({ x: 20, y: 44, width: 984, height: 498 });
    });

    test("safe area inset 变化后 step 触发 onRect", () => {
        let inset = { left: 0, top: 0, right: 0, bottom: 0 };
        const { controller, record } = makeHarness(
            () => inset,
            () => ({ width: 1280, height: 720 }),
        );
        controller.show();
        inset = { left: 30, top: 50, right: 30, bottom: 40 };
        controller.step();
        expect(record.rects.at(-1)).toEqual({ x: 30, y: 50, width: 1220, height: 630 });
    });

    test("readSafeArea/readBounds 每次 step 都被实时调用（防创建时快照）", () => {
        let safeAreaCalls = 0;
        let boundsCalls = 0;
        const controller = createSafeAreaOverlayController({
            readSafeArea: () => {
                safeAreaCalls += 1;
                return { left: 0, top: 0, right: 0, bottom: 0 };
            },
            readBounds: () => {
                boundsCalls += 1;
                return { width: 1280, height: 720 };
            },
            timeSource: () => 0,
            onRect: () => { },
            onVisible: () => { },
        });
        controller.show();
        const safeAreaAfterShow = safeAreaCalls;
        const boundsAfterShow = boundsCalls;
        controller.step();
        expect(safeAreaCalls).toBe(safeAreaAfterShow + 1);
        expect(boundsCalls).toBe(boundsAfterShow + 1);
    });

    test("收起态 step 不触发 onRect（隐藏后不浪费重绘）", () => {
        let bounds = { width: 1280, height: 720 };
        const { controller, record } = makeHarness(
            () => ({ left: 0, top: 0, right: 0, bottom: 0 }),
            () => bounds,
        );
        controller.show();
        controller.hide();
        const before = record.rects.length;
        bounds = { width: 1024, height: 576 };
        controller.step();
        expect(record.rects.length).toBe(before);
    });

    test("dispose 隐藏框且后续操作不再输出", () => {
        const { controller, record } = makeHarness(
            () => ({ left: 0, top: 0, right: 0, bottom: 0 }),
            () => ({ width: 1280, height: 720 }),
        );
        controller.show();
        controller.dispose();
        expect(record.visible).toEqual([true, false]);
        controller.show();
        controller.step();
        expect(record.visible.length).toBe(2);
    });
});
