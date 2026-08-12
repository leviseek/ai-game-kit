import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");

describe("arch-viewer workspace", () => {
    test("根脚本接入 arch workspace", () => {
        const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
            workspaces: string[];
            scripts: Record<string, string>;
        };
        expect(pkg.workspaces).toContain("tools/arch-viewer");
        expect(pkg.scripts.arch).toBe("bun ./tools/arch-viewer/cli.ts");
        expect(pkg.scripts["build:arch-web"]).toBe("tsc -p tools/arch-viewer/tsconfig.web.json");
        expect(pkg.scripts["test:arch"]).toBe("bun test ./tools/arch-viewer/test");
        expect(pkg.scripts.test).toContain("bun run test:arch");
        for (const scriptName of ["typecheck", "typecheck:ci"]) {
            expect(pkg.scripts[scriptName]).toContain("-p tools/arch-viewer/tsconfig.json");
            expect(pkg.scripts[scriptName]).toContain("-p tools/arch-viewer/tsconfig.web.json");
        }
    });

    test("lockfile 登记 arch workspace 的已有依赖", () => {
        const lockfile = readFileSync(resolve(root, "bun.lock"), "utf8");
        expect(lockfile).toContain('"tools/arch-viewer": {');
        expect(lockfile).toContain('"@types/node": "^26.1.2"');
        expect(lockfile).toContain('"typescript": "^5.9.0"');
    });
});
