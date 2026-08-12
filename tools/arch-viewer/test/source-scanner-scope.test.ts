import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { scanSources } from "../lib/analysis/source-scanner";

const roots: string[] = [];

function scanSource(lines: readonly string[]) {
    const root = mkdtempSync(join(tmpdir(), "arch-source-scope-"));
    roots.push(root);
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "main.ts"), `${lines.join("\n")}\n`);
    return scanSources(root, ["src/main.ts"]);
}

afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("scanSources lexical scopes", () => {
    test("扫描 constructor、accessor 与 static block 内的命名函数", () => {
        const result = scanSource([
            "class Containers {",
            "    constructor() { function fromConstructor() {} }",
            "    get value() { function fromGetter() {}; return 1; }",
            "    set value(next: number) { function fromSetter() {}; void next; }",
            "    static { function fromStaticBlock() {} }",
            "}",
        ]);

        expect(result.declarations
            .filter((declaration) => declaration.kind === "function")
            .map(({ qualifiedName, startLine, endLine }) => ({ qualifiedName, startLine, endLine })))
            .toEqual([
                { qualifiedName: "Containers::constructor::fromConstructor", startLine: 2, endLine: 2 },
                { qualifiedName: "Containers::value::fromGetter", startLine: 3, endLine: 3 },
                { qualifiedName: "Containers::value::fromSetter", startLine: 4, endLine: 4 },
                { qualifiedName: "Containers::fromStaticBlock", startLine: 5, endLine: 5 },
            ]);
    });

    test("不同词法块的同名函数保持公开名称但拥有独立 ID", () => {
        const result = scanSource([
            "function outer(flag: boolean) {",
            "    if (flag) {",
            "        function run() {}",
            "    } else {",
            "        function run() {}",
            "    }",
            "}",
        ]);
        const runs = result.declarations.filter((declaration) => declaration.qualifiedName === "outer::run");

        expect(runs.map(({ qualifiedName, startLine, endLine }) => ({
            qualifiedName,
            startLine,
            endLine,
        }))).toEqual([
            { qualifiedName: "outer::run", startLine: 3, endLine: 3 },
            { qualifiedName: "outer::run", startLine: 5, endLine: 5 },
        ]);
        expect(new Set(runs.map((declaration) => declaration.id)).size).toBe(2);
    });

    test("按成员类别聚合 overload 并保留 interface merging", () => {
        const result = scanSource([
            "class Service {",
            "    run(value: string): string;",
            "    run(value: number): number;",
            "    run(value: string | number): string | number { return value; }",
            "    static run(value: string): string;",
            "    static run(value: number): number;",
            "    static run(value: string | number): string | number { return value; }",
            "}",
            "interface Config { first: string; }",
            "interface Config { second: number; }",
        ]);
        const methods = result.declarations.filter((declaration) => declaration.qualifiedName === "Service::run");
        const configs = result.declarations.filter((declaration) => declaration.qualifiedName === "Config");

        expect(methods.map(({ startLine, endLine }) => ({ startLine, endLine }))).toEqual([
            { startLine: 2, endLine: 4 },
            { startLine: 5, endLine: 7 },
        ]);
        expect(new Set(methods.map((declaration) => declaration.id)).size).toBe(2);
        expect(configs.map(({ startLine, endLine }) => ({ startLine, endLine }))).toEqual([
            { startLine: 9, endLine: 10 },
        ]);
    });
});
