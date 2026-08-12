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
        expect(pkg.scripts["test:arch"]).toBe("bun test ./tools/arch-viewer/test");
    });
});
