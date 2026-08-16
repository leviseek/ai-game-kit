import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { createFixture, demoManifest, type Fixture, write } from "./helpers";
import { expandAssets, loadManifest, managedRoots, validateManifest } from "../lib/manifest";

describe("manifest 加载与展开", () => {
    let fx: Fixture;

    beforeEach(() => {
        fx = createFixture();
        write(join(fx.sync, "manifest.json"), demoManifest());
    });
    afterEach(() => fx.cleanup());

    it("加载合法 manifest 并展开资产（目录/文件两类形态）", () => {
        const manifest = loadManifest(fx.sync);
        const assets = expandAssets(manifest);
        expect(assets).toHaveLength(3);
        const skill = assets.find((a) => a.id === "demo-skill");
        expect(skill?.kind).toBe("skill");
        expect(skill?.source).toBe("skills/demo-skill");
        expect(skill?.targets).toHaveLength(2);
        const agent = assets.find((a) => a.id === "demo-agent");
        expect(agent?.source).toBe("agents/demo-agent.md");
        const cmd = assets.find((a) => a.id === "demo-cmd");
        expect(cmd?.source).toBe("commands/demo-cmd.md");
    });

    it("managedRoots 从 target 父目录推导并去重排序", () => {
        const manifest = loadManifest(fx.sync);
        const roots = managedRoots(expandAssets(manifest));
        expect(roots).toEqual([".toolA/agent", ".toolA/commands", ".toolA/skills", ".toolB/skills"]);
    });

    it("合法 manifest 无结构问题", () => {
        const manifest = loadManifest(fx.sync);
        expect(validateManifest(fx.sync, manifest)).toHaveLength(0);
    });

    it("非法 id 报 invalid-id", () => {
        const manifest = loadManifest(fx.sync);
        (manifest as { skills: Record<string, unknown> }).skills["Bad_ID"] = { targets: [".toolA/skills/Bad_ID"] };
        const issues = validateManifest(fx.sync, manifest);
        expect(issues.some((i) => i.code === "invalid-id" && i.severity === "error")).toBe(true);
    });

    it("跨资产重复 target 报 duplicate-target", () => {
        const manifest = loadManifest(fx.sync);
        (manifest as { commands: Record<string, unknown> }).commands["demo-cmd2"] = { targets: [".toolA/commands/demo-cmd.md"] };
        const issues = validateManifest(fx.sync, manifest);
        expect(issues.some((i) => i.code === "duplicate-target" && i.severity === "error")).toBe(true);
    });

    it("registry 源缺失报 missing-source", () => {
        const manifest = loadManifest(fx.sync);
        (manifest as { skills: Record<string, unknown> }).skills["ghost"] = { targets: [".toolA/skills/ghost"] };
        const issues = validateManifest(fx.sync, manifest);
        expect(issues.some((i) => i.code === "missing-source" && i.message.includes("ghost"))).toBe(true);
    });

    it("越界 target（含 ..）报 invalid-target", () => {
        const manifest = loadManifest(fx.sync);
        (manifest as { skills: Record<string, unknown> }).skills["evil"] = { targets: ["../outside"] };
        const issues = validateManifest(fx.sync, manifest);
        expect(issues.some((i) => i.code === "invalid-target" && i.severity === "error")).toBe(true);
    });
});
