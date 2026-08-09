import { describe, expect, test } from "bun:test";

import {
    createBuffer,
    encodePng,
    fillRect,
    fillRoundRect,
    parsePalette,
    renderAscii,
    strokeRect,
    type Rgba,
} from "../lib/pixel";

function isPngSignature(bytes: Uint8Array): boolean {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return sig.every((v, i) => bytes[i] === v);
}

function readChunks(bytes: Uint8Array): Array<{ type: string; data: Uint8Array }> {
    const chunks: Array<{ type: string; data: Uint8Array }> = [];
    let offset = 8;
    while (offset < bytes.length) {
        const length = (bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
        const type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!);
        const data = bytes.slice(offset + 8, offset + 8 + length);
        chunks.push({ type, data });
        offset += 12 + length;
    }
    return chunks;
}

describe("encodePng", () => {
    test("输出合法 PNG（签名 + IHDR/IDAT/IEND）", () => {
        const buf = createBuffer(2, 2);
        const png = encodePng(buf.width, buf.height, buf.data);
        expect(isPngSignature(png)).toBe(true);

        const chunks = readChunks(png);
        const types = chunks.map((c) => c.type);
        expect(types[0]).toBe("IHDR");
        expect(types).toContain("IDAT");
        expect(types[types.length - 1]).toBe("IEND");

        // IHDR: 2x2, bit depth 8 (offset 8), color type 6 RGBA (offset 9)
        const ihdr = chunks[0]!.data;
        expect(ihdr[0]!).toBe(0);
        expect(ihdr[1]!).toBe(0);
        expect(ihdr[2]!).toBe(0);
        expect(ihdr[3]!).toBe(2);
        expect(ihdr[4]!).toBe(0);
        expect(ihdr[5]!).toBe(0);
        expect(ihdr[8]!).toBe(8);
        expect(ihdr[9]!).toBe(6);
    });
});

describe("createBuffer / fillRect", () => {
    test("默认透明，fillRect 写入颜色", () => {
        const buf = createBuffer(3, 1);
        expect(buf.data[0]!).toBe(0);
        expect(buf.data[3]!).toBe(0);

        const color: Rgba = { r: 255, g: 0, b: 0, a: 255 };
        fillRect(buf, 1, 0, 1, 1, color);
        expect(buf.data[4]!).toBe(255);
        expect(buf.data[5]!).toBe(0);
        expect(buf.data[7]!).toBe(255);
        expect(buf.data[0]!).toBe(0); // x=0 未填充
    });

    test("fillRect 越界裁剪不抛错", () => {
        const buf = createBuffer(2, 2);
        fillRect(buf, -1, -1, 10, 10, { r: 1, g: 2, b: 3, a: 255 });
        expect(buf.data[0]!).toBe(1);
    });
});

describe("fillRoundRect / strokeRect", () => {
    test("圆角矩形四角像素透明，中心与边填充", () => {
        const buf = createBuffer(5, 5);
        fillRoundRect(buf, 0, 0, 5, 5, 1, { r: 10, g: 20, b: 30, a: 255 });
        // (0,0) 角外 → 透明
        expect(buf.data[0]!).toBe(0);
        // (2,2) 中心 → 填充
        const i = (2 * 5 + 2) * 4;
        expect(buf.data[i]!).toBe(10);
        expect(buf.data[i + 3]!).toBe(255);
        // (0,2) 左边 → 填充
        const left = (2 * 5 + 0) * 4;
        expect(buf.data[left]!).toBe(10);
    });

    test("radius 为 0 时退化为普通矩形", () => {
        const buf = createBuffer(3, 3);
        fillRoundRect(buf, 0, 0, 3, 3, 0, { r: 1, g: 1, b: 1, a: 255 });
        expect(buf.data[0]!).toBe(1);
    });

    test("strokeRect 只描边框", () => {
        const buf = createBuffer(4, 4);
        strokeRect(buf, 0, 0, 4, 4, { r: 200, g: 0, b: 0, a: 255 });
        // 四角填充
        expect(buf.data[0]!).toBe(200);
        expect(buf.data[12]!).toBe(200); // (3,0)
        expect(buf.data[48]!).toBe(200); // (0,3)
        // 内部 (1,1) 透明
        const inner = (1 * 4 + 1) * 4;
        expect(buf.data[inner]!).toBe(0);
    });
});

describe("parsePalette", () => {
    test("解析 #rrggbb 与 #rrggbbaa", () => {
        const palette = parsePalette("B=#ff0000,G=#00ff00ff,T=transparent");
        expect(palette.get("B")).toEqual({ r: 255, g: 0, b: 0, a: 255 });
        expect(palette.get("G")).toEqual({ r: 0, g: 255, b: 0, a: 255 });
        expect(palette.get("T")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    });

    test("非法条目忽略", () => {
        const palette = parsePalette("X=zzz,B=#112233");
        expect(palette.has("X")).toBe(false);
        expect(palette.get("B")).toBeDefined();
    });
});

describe("renderAscii", () => {
    test("字符映射调色板，. 为透明", () => {
        const palette = parsePalette("B=#ff0000,G=#00ff00");
        const art = [".B", "G."];
        const { width, height, data } = renderAscii(art, palette);
        expect(width).toBe(2);
        expect(height).toBe(2);
        expect(data[0]!).toBe(0); // (0,0) 透明
        expect(data[4]!).toBe(255); // (1,0) B 红
        expect(data[9]!).toBe(255); // (0,1) G 绿
        expect(data[15]!).toBe(0); // (1,1) 透明
    });

    test("每行宽度不一致时报错", () => {
        const palette = parsePalette("B=#ff0000");
        expect(() => renderAscii(["B", "BB"], palette)).toThrow();
    });

    test("未定义字符报错", () => {
        const palette = parsePalette("B=#ff0000");
        expect(() => renderAscii(["BX"], palette)).toThrow();
    });

    test("每行前导空白修剪（代码缩进容错）", () => {
        const palette = parsePalette("B=#ff0000");
        const { width } = renderAscii(["  BB"], palette);
        expect(width).toBe(2);
    });
});
