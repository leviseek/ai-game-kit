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
        const constructorDeclaration = result.declarations.find(
            (declaration) => declaration.qualifiedName === "Containers::constructor",
        );

        expect(constructorDeclaration && {
            kind: constructorDeclaration.kind,
            occurrences: constructorDeclaration.occurrences.map(({ memberKind, static: isStatic }) => ({
                memberKind,
                static: isStatic,
            })),
        }).toEqual({
            kind: "method",
            occurrences: [{ memberKind: "constructor", static: false }],
        });
        expect(result.declarations
            .filter((declaration) => declaration.kind === "function")
            .map(({ qualifiedName, startLine, endLine, occurrences }) => ({
                qualifiedName,
                startLine,
                endLine,
                occurrence: occurrences[0],
            })))
            .toEqual([
                {
                    qualifiedName: "Containers::constructor::fromConstructor",
                    startLine: 2,
                    endLine: 2,
                    occurrence: {
                        startLine: 2,
                        endLine: 2,
                        scopeKey: "module/class:Containers/constructor#0",
                        scopeKind: "constructor",
                        memberKind: "function",
                        static: false,
                    },
                },
                {
                    qualifiedName: "Containers::value::fromGetter",
                    startLine: 3,
                    endLine: 3,
                    occurrence: {
                        startLine: 3,
                        endLine: 3,
                        scopeKey: "module/class:Containers/member:instance:get:value#0",
                        scopeKind: "get",
                        memberKind: "function",
                        static: false,
                    },
                },
                {
                    qualifiedName: "Containers::value::fromSetter",
                    startLine: 4,
                    endLine: 4,
                    occurrence: {
                        startLine: 4,
                        endLine: 4,
                        scopeKey: "module/class:Containers/member:instance:set:value#0",
                        scopeKind: "set",
                        memberKind: "function",
                        static: false,
                    },
                },
                {
                    qualifiedName: "Containers::fromStaticBlock",
                    startLine: 5,
                    endLine: 5,
                    occurrence: {
                        startLine: 5,
                        endLine: 5,
                        scopeKey: "module/class:Containers/static-block#0",
                        scopeKind: "static-block",
                        memberKind: "function",
                        static: false,
                    },
                },
            ]);
    });

    test("不同词法块的同名函数聚合为 canonical 节点与 occurrences", () => {
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

        expect(runs).toHaveLength(1);
        expect(runs[0]?.id).toBe("function:src%2Fmain.ts:outer%3A%3Arun");
        expect(runs[0] && {
            startLine: runs[0].startLine,
            endLine: runs[0].endLine,
            occurrences: runs[0].occurrences,
        }).toEqual({
            startLine: 3,
            endLine: 5,
            occurrences: [
                {
                    startLine: 3,
                    endLine: 3,
                    scopeKey: "module/function:outer#0/if-then#0/block#0",
                    scopeKind: "block",
                    memberKind: "function",
                    static: false,
                },
                {
                    startLine: 5,
                    endLine: 5,
                    scopeKey: "module/function:outer#0/if-else#0/block#0",
                    scopeKind: "block",
                    memberKind: "function",
                    static: false,
                },
            ],
        });
    });

    test("聚合成员类别、overload 与 interface merging 为 occurrences", () => {
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

        expect(methods).toHaveLength(1);
        expect(methods[0]?.id).toBe("method:src%2Fmain.ts:Service%3A%3Arun");
        expect(methods[0] && {
            startLine: methods[0].startLine,
            endLine: methods[0].endLine,
            occurrences: methods[0].occurrences.map(({ startLine, endLine, memberKind, static: isStatic }) => ({
                startLine,
                endLine,
                memberKind,
                static: isStatic,
            })),
        }).toEqual({
            startLine: 2,
            endLine: 7,
            occurrences: [
                { startLine: 2, endLine: 2, memberKind: "method", static: false },
                { startLine: 3, endLine: 3, memberKind: "method", static: false },
                { startLine: 4, endLine: 4, memberKind: "method", static: false },
                { startLine: 5, endLine: 5, memberKind: "method", static: true },
                { startLine: 6, endLine: 6, memberKind: "method", static: true },
                { startLine: 7, endLine: 7, memberKind: "method", static: true },
            ],
        });
        expect(configs).toHaveLength(1);
        expect(configs[0] && {
            startLine: configs[0].startLine,
            endLine: configs[0].endLine,
            occurrences: configs[0].occurrences.map(({ startLine, endLine }) => ({ startLine, endLine })),
        }).toEqual({
            startLine: 9,
            endLine: 10,
            occurrences: [
                { startLine: 9, endLine: 9 },
                { startLine: 10, endLine: 10 },
            ],
        });
    });

    test("前置 block 不改变语义节点 ID", () => {
        const before = scanSource([
            "function outer(flag: boolean) {",
            "    if (flag) { function run() {} }",
            "    else { function run() {} }",
            "}",
        ]).declarations.find((declaration) => declaration.qualifiedName === "outer::run");
        const after = scanSource([
            "function outer(flag: boolean) {",
            "    { function other() {} }",
            "    if (flag) { function run() {} }",
            "    else { function run() {} }",
            "}",
        ]).declarations.find((declaration) => declaration.qualifiedName === "outer::run");

        expect(before?.id).toBe("function:src%2Fmain.ts:outer%3A%3Arun");
        expect(after?.id).toBe(before?.id);
        expect(before?.occurrences.map(({ startLine, endLine }) => ({ startLine, endLine }))).toEqual([
            { startLine: 2, endLine: 2 },
            { startLine: 3, endLine: 3 },
        ]);
        expect(after?.occurrences.map(({ startLine, endLine }) => ({ startLine, endLine }))).toEqual([
            { startLine: 3, endLine: 3 },
            { startLine: 4, endLine: 4 },
        ]);
    });
});
