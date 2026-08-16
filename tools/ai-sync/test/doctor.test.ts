import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { createFixture, demoManifest, type Fixture, write } from "./helpers";
import { expandAssets, hasStructuralErrors, loadManifest, validateManifest } from "../lib/manifest";
import { checkExpected, expectedFiles, scanManagedRoots, writeExpected, type SyncIssue } from "../lib/sync";

/**
 * doctor 语义 = manifest 结构校验 + 期望文件校验 + 受管根扫描 的 union。
 * 此处断言组合后的严重度分布与问题码集合，等价于 doctor 命令的诊断结果。
 */
describe("doctor 组合诊断", () => {
    let fx: Fixture;

    beforeEach(() => {
        fx = createFixture();
        write(join(fx.sync, "manifest.json"), demoManifest());
    });
    afterEach(() => fx.cleanup());

    function diagnose(): SyncIssue[] {
        const manifest = loadManifest(fx.sync);
        const assets = expandAssets(manifest);
        const structural = validateManifest(fx.sync, manifest);
        // 与 doctor 命令同语义：结构错误短路，只报结构问题（此时 expectedFiles 不可信）
        if (hasStructuralErrors(structural)) return structural;
        const expected = expectedFiles(fx.sync, assets, {});
        return [...structural, ...checkExpected(fx.root, expected), ...scanManagedRoots(fx.root, assets, expected)];
    }

    it("全新仓库：全部 target 缺失 → 4 个 error（missing）", () => {
        const issues = diagnose();
        expect(issues.filter((i) => i.code === "missing")).toHaveLength(4);
        expect(issues.filter((i) => i.severity === "error")).toHaveLength(4);
    });

    it("结构错误（registry 源缺失）短路漂移诊断", () => {
        // 篡改一个 target、制造一个多余文件、声明一个缺失的 registry 源
        write(join(fx.root, ".toolA", "agent", "demo-agent.md"), "tampered\n");
        write(join(fx.root, ".toolA", "skills", "rogue", "SKILL.md"), "x\n");
        const manifest = loadManifest(fx.sync);
        (manifest as { skills: Record<string, unknown> }).skills["ghost"] = { targets: [".toolA/skills/ghost"] };
        write(join(fx.sync, "manifest.json"), JSON.stringify(manifest));

        const issues = diagnose();
        const codes = new Set(issues.map((i) => i.code));
        // 结构错误短路：只报 missing-source，不再跑 expectedFiles/漂移扫描
        expect(hasStructuralErrors(issues)).toBe(true);
        expect(codes.has("missing-source")).toBe(true);
        expect(codes.has("stale")).toBe(false);
        expect(codes.has("extra")).toBe(false);
    });

    it("同步落盘后 error 清零", () => {
        const manifest = loadManifest(fx.sync);
        writeExpected(fx.root, expectedFiles(fx.sync, expandAssets(manifest), {}));
        const issues = diagnose();
        expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
    });
});
