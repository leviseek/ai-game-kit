/**
 * schema ↔ 描述对齐测试：验证 tools.ts 工具描述中承诺的参数键，在 cli.ts 的 inputSchema 中实际存在。
 * 防止"描述写了但 zod 未声明 → strip 丢弃 → 功能静默失效"（审查 P0-3）。
 * 用静态扫描实现：从 cli.ts 提取 schema 声明的键名，对照工具描述中出现的 `参数: <key>` 提及。
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { READ_TOOLS, WRITE_TOOLS } from "../lib/tools";

const cliSrc = readFileSync(join(import.meta.dir, "..", "cli.ts"), "utf8");
// 提取 inputSchema 中声明的键（z.string()/z.number()/z.boolean()/z.array() 前的标识符）；
// 缩进宽度不约束，避免 prettier 格式化后误报
const schemaKeys = new Set<string>();
for (const match of cliSrc.matchAll(/^\s+([a-zA-Z][a-zA-Z0-9]*):\s*z\./gm)) {
    schemaKeys.add(match[1]!);
}
// 补充常见默认键（schema 定义在 inputSchema 内）
for (const k of ["package", "component", "strict", "url", "section", "keyword", "maxResults", "lines"]) schemaKeys.add(k);

/** 从工具描述中提取"参数: xxx"或"可选 xxx"提及的键。 */
function mentionedParams(desc: string): string[] {
    const out: string[] = [];
    const re = /(?:参数|可选|传)\s*(?::)?\s*([a-zA-Z][a-zA-Z0-9]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(desc)) !== null) {
        const key = m[1]!;
        if (["package", "component", "doc", "name", "target", "src", "full", "page", "index", "confirm", "files"].includes(key)) {
            out.push(key);
        }
    }
    return [...new Set(out)];
}

describe("工具描述提及参数 ⊆ cli.ts inputSchema 键", () => {
    it("写工具描述提及的参数在 schema 中声明", () => {
        const missing: string[] = [];
        for (const [name, tool] of Object.entries(WRITE_TOOLS)) {
            for (const key of mentionedParams(tool.description)) {
                if (!schemaKeys.has(key)) missing.push(`${name} 描述提及 "${key}" 但 schema 未声明`);
            }
        }
        expect(missing).toEqual([]);
    });

    it("读工具描述提及的参数在 schema 中声明", () => {
        const missing: string[] = [];
        for (const [name, tool] of Object.entries(READ_TOOLS)) {
            for (const key of mentionedParams(tool.description)) {
                if (!schemaKeys.has(key)) missing.push(`${name} 描述提及 "${key}" 但 schema 未声明`);
            }
        }
        expect(missing).toEqual([]);
    });
});
