/**
 * 像素图程序化生成核心（零依赖）：
 * 像素缓冲（RGBA）→ PNG 编码（node:zlib deflate + CRC32）→ ASCII 画布渲染。
 * 像素风格要求的硬边/无抗锯齿/精确透明/整数像素，均由本模块确定性保证。
 */

import { deflateSync } from "node:zlib";

export interface Rgba {
    readonly r: number;
    readonly g: number;
    readonly b: number;
    readonly a: number;
}

export interface PixelBuffer {
    readonly width: number;
    readonly height: number;
    readonly data: Uint8ClampedArray;
}

export function createBuffer(width: number, height: number): PixelBuffer {
    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function pixelIndex(buf: PixelBuffer, x: number, y: number): number {
    return (y * buf.width + x) * 4;
}

/** 填充矩形（支持负坐标越界裁剪）。 */
export function fillRect(buf: PixelBuffer, x: number, y: number, w: number, h: number, color: Rgba): void {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(buf.width, x + w);
    const y1 = Math.min(buf.height, y + h);
    for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
            const i = pixelIndex(buf, px, py);
            buf.data[i] = color.r;
            buf.data[i + 1] = color.g;
            buf.data[i + 2] = color.b;
            buf.data[i + 3] = color.a;
        }
    }
}

/**
 * 填充圆角矩形：四角为 1/4 圆（像素风用整数圆），
 * 边/中心走 fillRect，无抗锯齿。radius 为圆角半径像素。
 */
export function fillRoundRect(buf: PixelBuffer, x: number, y: number, w: number, h: number, radius: number, color: Rgba): void {
    const r = Math.max(0, Math.min(radius, Math.floor(Math.min(w, h) / 2)));
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(buf.width, x + w);
    const y1 = Math.min(buf.height, y + h);

    for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
            if (!inRoundRect(px, py, x, y, w, h, r)) continue;
            const i = pixelIndex(buf, px, py);
            buf.data[i] = color.r;
            buf.data[i + 1] = color.g;
            buf.data[i + 2] = color.b;
            buf.data[i + 3] = color.a;
        }
    }
}

/** 判定像素是否在圆角矩形内（含边界）。 */
function inRoundRect(px: number, py: number, x: number, y: number, w: number, h: number, r: number): boolean {
    if (px < x || px >= x + w || py < y || py >= y + h) return false;
    if (r <= 0) return true;

    const corners: Array<{ cx: number; cy: number; inside: boolean }> = [
        { cx: x + r, cy: y + r, inside: px < x + r && py < y + r },
        { cx: x + w - 1 - r, cy: y + r, inside: px >= x + w - r && py < y + r },
        { cx: x + r, cy: y + h - 1 - r, inside: px < x + r && py >= y + h - r },
        { cx: x + w - 1 - r, cy: y + h - 1 - r, inside: px >= x + w - r && py >= y + h - r },
    ];
    for (const corner of corners) {
        if (!corner.inside) continue;
        const dx = px - corner.cx;
        const dy = py - corner.cy;
        return dx * dx + dy * dy <= r * r;
    }
    return true;
}

/** 绘制空心矩形边框（1px 线宽）。 */
export function strokeRect(buf: PixelBuffer, x: number, y: number, w: number, h: number, color: Rgba): void {
    fillRect(buf, x, y, w, 1, color);
    fillRect(buf, x, y + h - 1, w, 1, color);
    fillRect(buf, x, y, 1, h, color);
    fillRect(buf, x + w - 1, y, 1, h, color);
}

// ---- PNG 编码 ----

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(bytes: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    const crc = crc32(out.subarray(4, 8 + data.length));
    dv.setUint32(8 + data.length, crc);
    return out;
}

/** 将 RGBA 像素缓冲编码为 PNG 字节。 */
export function encodePng(width: number, height: number, rgba: Uint8ClampedArray): Uint8Array {
    const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, width);
    dv.setUint32(4, height);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // color type RGBA
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    // 每行前置 filter byte 0（None），再压缩
    const stride = width * 4;
    const raw = new Uint8Array((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0;
        raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
    }
    const idatData = deflateSync(raw, { level: 9 });

    const parts: Uint8Array[] = [signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", idatData), pngChunk("IEND", new Uint8Array(0))];
    const total = parts.reduce((sum, p) => sum + p.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

// ---- 调色板与 ASCII 画布 ----

/** 解析调色板字符串："B=#rrggbb,G=#rrggbbaa,T=transparent"（逗号分隔）。 */
export function parsePalette(spec: string): Map<string, Rgba> {
    const map = new Map<string, Rgba>();
    for (const entry of spec.split(",")) {
        const trimmed = entry.trim();
        if (trimmed.length === 0) continue;
        const eq = trimmed.indexOf("=");
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim();
        const color = parseColor(value);
        if (color !== undefined) map.set(key, color);
    }
    return map;
}

function parseColor(value: string): Rgba | undefined {
    if (value === "transparent" || value === "none") {
        return { r: 0, g: 0, b: 0, a: 0 };
    }
    const m = value.match(/^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/);
    if (!m) return undefined;
    const hex = m[1]!;
    return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
        a: m[2] ? Number.parseInt(m[2], 16) : 255,
    };
}

/**
 * 渲染 ASCII 画布：每行字符对应一行像素，字符映射调色板，
 * "." 或空格为透明。每行前导空白会被修剪（代码缩进容错）。
 */
export function renderAscii(art: readonly string[], palette: Map<string, Rgba>): { width: number; height: number; data: Uint8ClampedArray } {
    const rows = art.map((line) => line.trimEnd().trimStart());
    const widths = new Set(rows.map((line) => line.length));
    if (widths.size > 1) {
        throw new Error(`ASCII 画布每行宽度不一致: ${[...widths].join(", ")}（请对齐行宽，短行用 . 补齐）`);
    }
    const width = rows[0]?.length ?? 0;
    const height = rows.length;
    if (width <= 0 || height <= 0) throw new Error("ASCII 画布为空");

    const buffer = createBuffer(width, height);
    for (let y = 0; y < height; y++) {
        const line = rows[y]!;
        for (let x = 0; x < width; x++) {
            const ch = line[x]!;
            if (ch === "." || ch === " ") continue;
            const color = palette.get(ch);
            if (color === undefined) {
                throw new Error(`ASCII 画布引用了未定义颜色字符: "${ch}"（第 ${y + 1} 行）`);
            }
            const i = (y * width + x) * 4;
            buffer.data[i] = color.r;
            buffer.data[i + 1] = color.g;
            buffer.data[i + 2] = color.b;
            buffer.data[i + 3] = color.a;
        }
    }
    return { width, height, data: buffer.data };
}
