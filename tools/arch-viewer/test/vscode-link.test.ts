import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createVsCodeUrl } from "../web/vscode";
import { createSourceVsCodeHref } from "../web/render/inspector";
import type { SourceLocation } from "../lib/graph/types";

const webRoot = resolve(import.meta.dir, "../web");

describe("createVsCodeUrl", () => {
    test("Windows 路径 URL encode 后保留 line 与 column", () => {
        const location: SourceLocation = {
            filePath: "D:\\ai-work\\ai game kit\\src\\入口.ts",
            line: 42,
            column: 7,
        };

        expect(createVsCodeUrl(location)).toBe("vscode://file/D%3A%5Cai-work%5Cai%20game%20kit%5Csrc%5C%E5%85%A5%E5%8F%A3.ts:42:7");
    });
});

describe("Inspector source VS Code href", () => {
    test("/api/source 成功前不从 snapshot location 生成 href", () => {
        const snapshotLocation: SourceLocation = {
            filePath: "D:\\snapshot\\stale.ts",
            line: 3,
        };
        const verifiedLocation: SourceLocation = {
            filePath: "D:\\verified\\source.ts",
            line: 9,
            column: 2,
        };

        expect(createSourceVsCodeHref(undefined)).toBeUndefined();
        expect(
            createSourceVsCodeHref({
                location: verifiedLocation,
                startLine: 9,
                endLine: 9,
                lines: [{ number: 9, text: "export const ok = true;" }],
            }),
        ).toBe(createVsCodeUrl(verifiedLocation));
        expect(
            createSourceVsCodeHref({
                location: verifiedLocation,
                startLine: 9,
                endLine: 9,
                lines: [],
            }),
        ).not.toBe(createVsCodeUrl(snapshotLocation));
    });
});

describe("arch viewer HTML shell", () => {
    test("包含稳定挂载点且不引用外部 URL", () => {
        const html = readFileSync(resolve(webRoot, "index.html"), "utf8");

        for (const id of ["nav-hierarchy", "nav-startup", "nav-dependencies", "nav-data-flow", "nav-calls", "nav-resources", "search-input", "graph-canvas", "inspector", "status"]) {
            expect(html).toContain(`id="${id}"`);
        }
        expect(html).not.toMatch(/https?:\/\//);
    });
});
