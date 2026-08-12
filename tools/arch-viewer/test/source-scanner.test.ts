import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { scanSources } from "../lib/analysis/source-scanner";

const roots: string[] = [];

function createFixture(): string {
    const root = mkdtempSync(join(tmpdir(), "arch-source-scanner-"));
    roots.push(root);
    mkdirSync(join(root, "src", "models"), { recursive: true });
    mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
    mkdirSync(join(root, "third-party"), { recursive: true });
    mkdirSync(join(root, "assets", "framework", "libs", "fairygui"), { recursive: true });

    writeFileSync(join(root, "src", "dep.ts"), "export const value = 1;\n");
    writeFileSync(join(root, "src", "direct.mts"), "export function direct() {}\n");
    writeFileSync(join(root, "src", "models", "index.ts"), "export type Model = string;\n");
    writeFileSync(join(root, "src", "view.tsx"), "export function View() { return null; }\n");
    writeFileSync(join(root, "src", "types.ts"), "export interface Shared {}\n");
    writeFileSync(join(root, "src", "main.ts.meta"), "ignored\n");
    writeFileSync(join(root, "src", "ambient.d.ts"), "export declare function ambient(): void;\n");
    writeFileSync(join(root, "src", "ambient.d.mts"), "export declare function ambientMts(): void;\n");
    writeFileSync(join(root, "node_modules", "pkg", "index.ts"), "export class Package {}\n");
    writeFileSync(join(root, "third-party", "vendor.ts"), "export class Vendor {}\n");
    writeFileSync(join(root, "assets", "framework", "libs", "fairygui", "runtime.ts"), "export class Generated {}\n");
    writeFileSync(join(root, "src", "main.ts"), [
        'import { value } from "./dep";',
        'import { direct } from "./direct.mts";',
        'import type { Shared } from "./types";',
        'import React from "react";',
        'export { Model } from "./models";',
        'export { View } from "./view";',
        '',
        'export interface Api { run(): void; }',
        'export type Alias = Shared;',
        'export class Service {',
        '    run(): void {}',
        '}',
        '',
        'export function outer(): void {',
        '    function inner(): void {}',
        '    inner();',
        '}',
        'const expression = function ignored(): void {};',
        'void import("./dynamic");',
        'require("./legacy");',
        'void value;',
        'void direct;',
        'void expression;',
        '',
    ].join("\n"));
    return root;
}

afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("scanSources", () => {
    test("扫描声明、静态依赖并忽略排除路径", () => {
        const root = createFixture();
        const files = [
            "src/main.ts",
            "src/dep.ts",
            "src/direct.mts",
            "src/models/index.ts",
            "src/view.tsx",
            "src/types.ts",
            "src/main.ts.meta",
            "src/ambient.d.ts",
            "src/ambient.d.mts",
            "node_modules/pkg/index.ts",
            "third-party/vendor.ts",
            "assets/framework/libs/fairygui/runtime.ts",
        ];

        const result = scanSources(root, files);

        expect(result.files).toEqual([
            "src/dep.ts",
            "src/direct.mts",
            "src/main.ts",
            "src/models/index.ts",
            "src/types.ts",
            "src/view.tsx",
        ]);
        expect(result.declarations.map(({ name, qualifiedName, kind, filePath, startLine, endLine, exported }) => ({
            name,
            qualifiedName,
            kind,
            filePath,
            startLine,
            endLine,
            exported,
        }))).toEqual([
            { name: "direct", qualifiedName: "direct", kind: "function", filePath: "src/direct.mts", startLine: 1, endLine: 1, exported: true },
            { name: "Api", qualifiedName: "Api", kind: "interface", filePath: "src/main.ts", startLine: 8, endLine: 8, exported: true },
            { name: "run", qualifiedName: "Api::run", kind: "method", filePath: "src/main.ts", startLine: 8, endLine: 8, exported: false },
            { name: "Alias", qualifiedName: "Alias", kind: "type", filePath: "src/main.ts", startLine: 9, endLine: 9, exported: true },
            { name: "Service", qualifiedName: "Service", kind: "class", filePath: "src/main.ts", startLine: 10, endLine: 12, exported: true },
            { name: "run", qualifiedName: "Service::run", kind: "method", filePath: "src/main.ts", startLine: 11, endLine: 11, exported: false },
            { name: "outer", qualifiedName: "outer", kind: "function", filePath: "src/main.ts", startLine: 14, endLine: 17, exported: true },
            { name: "inner", qualifiedName: "outer::inner", kind: "function", filePath: "src/main.ts", startLine: 15, endLine: 15, exported: false },
            { name: "Model", qualifiedName: "Model", kind: "type", filePath: "src/models/index.ts", startLine: 1, endLine: 1, exported: true },
            { name: "Shared", qualifiedName: "Shared", kind: "interface", filePath: "src/types.ts", startLine: 1, endLine: 1, exported: true },
            { name: "View", qualifiedName: "View", kind: "function", filePath: "src/view.tsx", startLine: 1, endLine: 1, exported: true },
        ]);
        expect(new Set(result.declarations.map((declaration) => declaration.id)).size).toBe(result.declarations.length);
        expect(result.imports).toEqual([
            { fromFile: "src/main.ts", specifier: "react", kind: "import", typeOnly: false, external: true },
            { fromFile: "src/main.ts", toFile: "src/dep.ts", specifier: "./dep", kind: "import", typeOnly: false, external: false },
            { fromFile: "src/main.ts", toFile: "src/direct.mts", specifier: "./direct.mts", kind: "import", typeOnly: false, external: false },
            { fromFile: "src/main.ts", toFile: "src/models/index.ts", specifier: "./models", kind: "export", typeOnly: false, external: false },
            { fromFile: "src/main.ts", toFile: "src/types.ts", specifier: "./types", kind: "import", typeOnly: true, external: false },
            { fromFile: "src/main.ts", toFile: "src/view.tsx", specifier: "./view", kind: "export", typeOnly: false, external: false },
        ]);
    });
});
