/**
 * 像素切图资源管线：scale9grid 解析、package.xml 幂等登记。
 * 像素绘制（pixel.ts）负责出图；本模块负责把生成图登记进资源清单。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { nextResourceId, type FguiPackage } from "./fgui";

export interface Scale9Grid {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

/** 解析 FairyGUI scale9grid 四元组 "x,y,width,height"。 */
export function parseScale9grid(value: string): Scale9Grid {
    const parts = value.split(",").map((s) => Number.parseInt(s.trim(), 10));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
        throw new Error(`scale9grid 格式应为 x,y,width,height，收到: "${value}"`);
    }
    const [x, y, width, height] = parts as [number, number, number, number];
    if (x < 0 || y < 0 || width <= 0 || height <= 0) {
        throw new Error(`scale9grid 非法（x/y 非负且 width/height 为正数）: "${value}"`);
    }
    return { x, y, width, height };
}

/**
 * 检查资源是否已登记（按文件名 + 路径匹配）。返回 true 表示已存在。
 */
export function ensureResourceRegistered(pkg: FguiPackage, fileName: string, path: string): boolean {
    return pkg.resources.some((r) => r.name === fileName && normalizePath(r.path) === normalizePath(path));
}

function normalizePath(path: string): string {
    const p = path.replace(/\\/g, "/");
    const withLeading = p.startsWith("/") ? p : `/${p}`;
    return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

/**
 * 在 package.xml 的 <resources> 内登记一张生成图片（幂等）：
 * 已存在则跳过，否则分配新 id 并追加 <image> 条目。
 * 用字符串操作插入，保留原文件格式。prefix 用于 id 前缀续编。
 */
export function registerGeneratedImage(pkg: FguiPackage, fileName: string, path: string, scale9grid?: string, prefix?: string): string {
    if (ensureResourceRegistered(pkg, fileName, path)) {
        const existing = pkg.resources.find((r) => r.name === fileName);
        if (existing) return existing.id;
    }

    const scaleAttr = scale9grid ? ` scale="9grid" scale9grid="${scale9grid}"` : "";
    const entry = `<image id="" name="${fileName}" path="${normalizePath(path)}"${scaleAttr} qualityOption="source" duplicatePadding="true"/>`;
    return appendResourceEntry(pkg, entry, prefix);
}

/**
 * 在 package.xml 的 <resources> 内登记一个组件（幂等）：
 * 已存在（同名组件）则返回其 id，否则分配新 id 并追加 <component> 条目。
 * prefix 用于 id 前缀续编。
 */
export function registerComponent(pkg: FguiPackage, fileName: string, path = "/", prefix?: string): string {
    const existing = pkg.resources.find((r) => r.kind === "component" && r.name === fileName);
    if (existing) return existing.id;

    const entry = `<component id="" name="${fileName}" path="${normalizePath(path)}" exported="true"/>`;
    return appendResourceEntry(pkg, entry, prefix);
}

/** 插入资源条目到 <resources> 块：分配 5 位 id（支持前缀续编）并写入磁盘。 */
function appendResourceEntry(pkg: FguiPackage, entryTemplate: string, prefix?: string): string {
    const packageXmlPath = join(pkg.dir, "package.xml");
    const xml = readFileSync(packageXmlPath, "utf8");

    const id = nextResourceId(pkg, prefix);
    const entry = entryTemplate.replace('id=""', `id="${id}"`);

    const resourcesStart = xml.indexOf("<resources>");
    const resourcesEnd = xml.indexOf("</resources>");
    if (resourcesStart < 0 || resourcesEnd < 0) {
        throw new Error(`package.xml 缺少 <resources> 块: ${packageXmlPath}`);
    }
    const inserted = `${xml.slice(0, resourcesStart + "<resources>".length)}\n    ${entry}${xml.slice(resourcesStart + "<resources>".length)}`;
    writeFileSync(packageXmlPath, inserted, "utf8");
    return id;
}
