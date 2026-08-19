import { describe, expect, test } from "bun:test";

import { createListViewLayout, type ListViewLayout } from "../../../assets/atb/ui/list/ListViewLayout";
import { ListViewDirection } from "../../../assets/atb/ui/list/ListViewTypes";

function layout(overrides: { itemSize?: number; spacing?: number; buffer?: number } = {}): ListViewLayout {
    return createListViewLayout({
        direction: ListViewDirection.Vertical,
        itemSize: overrides.itemSize ?? 100,
        spacing: overrides.spacing ?? 0,
        buffer: overrides.buffer ?? 0,
    });
}

describe("ListViewLayout", () => {
    test("contentSize：空数据为 0，n 项含间距", () => {
        const l = layout({ itemSize: 100, spacing: 10 });
        expect(l.contentSize(0)).toBe(0);
        expect(l.contentSize(1)).toBe(100);
        expect(l.contentSize(3)).toBe(320); // 3 * 100 + 2 * 10
    });

    test("itemPosition：i * stride", () => {
        const l = layout({ itemSize: 90, spacing: 10 });
        expect(l.itemPosition(0)).toBe(0);
        expect(l.itemPosition(2)).toBe(200);
    });

    test("visibleRange：空数据返回空区间", () => {
        const l = layout();
        expect(l.visibleRange(0, 250, 0)).toEqual({ first: 0, last: -1 });
    });

    test("visibleRange：基础区间与 buffer 外扩", () => {
        const l = layout({ buffer: 0 });
        expect(l.visibleRange(0, 250, 10)).toEqual({ first: 0, last: 2 });
        const withBuffer = layout({ buffer: 100 });
        expect(withBuffer.visibleRange(0, 250, 10)).toEqual({ first: 0, last: 3 });
    });

    test("visibleRange：滚动中区间平移", () => {
        const l = layout({ buffer: 0 });
        expect(l.visibleRange(350, 250, 10)).toEqual({ first: 3, last: 6 });
    });

    test("visibleRange：尾部按 count 钳制，负偏移（回弹）首项钳到 0", () => {
        const l = layout({ buffer: 0 });
        expect(l.visibleRange(300, 250, 5)).toEqual({ first: 2, last: 4 });
        expect(l.visibleRange(10000, 250, 5)).toEqual({ first: 0, last: -1 }); // 偏移超界：空区间
        expect(l.visibleRange(-80, 250, 10)).toEqual({ first: 0, last: 1 });
    });

    test("visibleRange：边界恰为 stride 整数倍时多渲染一项（安全方向）", () => {
        const l = layout({ buffer: 0 });
        // item 3 起点 300 恰在视口右缘 [0, 300) 之外，仍被包含
        expect(l.visibleRange(0, 300, 10)).toEqual({ first: 0, last: 3 });
    });

    test("clampOffset：负偏移归零、超上限钳到 max(0, 内容 - 视口)", () => {
        const l = layout({ buffer: 0 });
        expect(l.clampOffset(-5, 5, 250)).toBe(0);
        expect(l.clampOffset(500, 5, 250)).toBe(250); // 内容 500 - 视口 250
        expect(l.clampOffset(300, 2, 500)).toBe(0); // 内容不足一屏
        expect(l.clampOffset(10, 0, 250)).toBe(0); // 空数据
    });
});
