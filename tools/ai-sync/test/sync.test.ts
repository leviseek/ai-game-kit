import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createFixture, demoManifest, type Fixture, write } from "./helpers";
import { expandAssets, loadManifest } from "../lib/manifest";
import { checkExpected, expectedFiles, scanManagedRoots, writeExpected } from "../lib/sync";

describe("expectedFiles 生成", () => {
    let fx: Fixture;

    beforeEach(() => {
        fx = createFixture();
        write(join(fx.sync, "manifest.json"), demoManifest());
    });
    afterEach(() => fx.cleanup());

    it("目录资产展开为目录树并映射到全部 target", () => {
        const manifest = loadManifest(fx.sync);
        const files = expectedFiles(fx.sync, expandAssets(manifest), {});
        expect(files).toHaveLength(4); // skill×2 target + agent×1 + command×1
        expect(files.find((f) => f.path === ".toolA/skills/demo-skill/SKILL.md")?.content).toBe("demo skill body\n");
        expect(files.find((f) => f.path === ".toolB/skills/demo-skill/SKILL.md")?.content).toBe("demo skill body\n");
        expect(files.find((f) => f.path === ".toolA/agent/demo-agent.md")?.content).toBe("demo agent body\n");
        expect(files.find((f) => f.path === ".toolA/commands/demo-cmd.md")?.content).toBe("demo cmd body\n");
    });

    it("agent 模板经 models.json 渲染 primary（占位符替换）", () => {
        write(join(fx.sync, "registry", "agents", "demo-agent.md"), "---\nmodel: {{model:demo-agent}}\n---\n");
        const manifest = loadManifest(fx.sync);
        const files = expectedFiles(fx.sync, expandAssets(manifest), { "demo-agent": { primary: "provider/model-x", fallback: null } });
        const agent = files.find((f) => f.path === ".toolA/agent/demo-agent.md");
        expect(agent?.content).toBe("---\nmodel: provider/model-x\n---\n");
    });
});

describe("checkExpected 缺失/过期", () => {
    let fx: Fixture;

    beforeEach(() => {
        fx = createFixture();
        write(join(fx.sync, "manifest.json"), demoManifest());
    });
    afterEach(() => fx.cleanup());

    it("全部一致时无问题", () => {
        writeExpected(fx.root, expectedFiles(fx.sync, expandAssets(loadManifest(fx.sync)), {}));
        const issues = checkExpected(fx.root, expectedFiles(fx.sync, expandAssets(loadManifest(fx.sync)), {}));
        expect(issues).toHaveLength(0);
    });

    it("缺失文件报 missing", () => {
        const issues = checkExpected(fx.root, expectedFiles(fx.sync, expandAssets(loadManifest(fx.sync)), {}));
        expect(issues.filter((i) => i.code === "missing")).toHaveLength(4);
        expect(issues.every((i) => i.severity === "error")).toBe(true);
    });

    it("内容不一致报 stale（逐字对比）", () => {
        write(join(fx.root, ".toolA", "skills", "demo-skill", "SKILL.md"), "tampered\n");
        const issues = checkExpected(fx.root, expectedFiles(fx.sync, expandAssets(loadManifest(fx.sync)), {}));
        expect(issues.filter((i) => i.code === "stale")).toHaveLength(1);
    });

    it("尾换行差异不误报（对齐 freshness 语义）", () => {
        write(join(fx.root, ".toolA", "agent", "demo-agent.md"), "demo agent body");
        const issues = checkExpected(fx.root, expectedFiles(fx.sync, expandAssets(loadManifest(fx.sync)), {}));
        expect(issues.filter((i) => i.code === "stale" && i.path === ".toolA/agent/demo-agent.md")).toHaveLength(0);
    });
});

describe("scanManagedRoots 多余/空目录", () => {
    let fx: Fixture;

    beforeEach(() => {
        fx = createFixture();
        write(join(fx.sync, "manifest.json"), demoManifest());
        // 先落盘期望文件，避免 missing 噪音
        writeExpected(fx.root, expectedFiles(fx.sync, expandAssets(loadManifest(fx.sync)), {}));
    });
    afterEach(() => fx.cleanup());

    it("受管根下未声明文件报 extra warning", () => {
        write(join(fx.root, ".toolA", "skills", "rogue", "SKILL.md"), "x\n");
        const issues = scanManagedRoots(fx.root, expandAssets(loadManifest(fx.sync)), expectedFiles(fx.sync, expandAssets(loadManifest(fx.sync)), {}));
        const extra = issues.filter((i) => i.code === "extra");
        expect(extra).toHaveLength(1);
        expect(extra[0]?.severity).toBe("warning");
        expect(extra[0]?.path).toBe(".toolA/skills/rogue/SKILL.md");
    });

    it("受管根下空目录报 empty-dir warning", () => {
        mkdirSync(join(fx.root, ".toolB", "skills", "vacant"), { recursive: true });
        const issues = scanManagedRoots(fx.root, expandAssets(loadManifest(fx.sync)), expectedFiles(fx.sync, expandAssets(loadManifest(fx.sync)), {}));
        expect(issues.some((i) => i.code === "empty-dir" && i.path === ".toolB/skills/vacant")).toBe(true);
    });

    it("期望文件不误报", () => {
        const issues = scanManagedRoots(fx.root, expandAssets(loadManifest(fx.sync)), expectedFiles(fx.sync, expandAssets(loadManifest(fx.sync)), {}));
        expect(issues.filter((i) => i.code === "extra")).toHaveLength(0);
    });
});

describe("writeExpected 落盘", () => {
    let fx: Fixture;

    beforeEach(() => {
        fx = createFixture();
        write(join(fx.sync, "manifest.json"), demoManifest());
    });
    afterEach(() => fx.cleanup());

    it("写入缺失文件并跳过一致文件", () => {
        const expected = expectedFiles(fx.sync, expandAssets(loadManifest(fx.sync)), {});
        const first = writeExpected(fx.root, expected);
        expect(first.written).toHaveLength(4);
        expect(existsSync(join(fx.root, ".toolA", "skills", "demo-skill", "SKILL.md"))).toBe(true);

        const second = writeExpected(fx.root, expected);
        expect(second.written).toHaveLength(0);
        expect(second.unchanged).toHaveLength(4);
    });

    it("覆盖被篡改的目标文件", () => {
        write(join(fx.root, ".toolA", "commands", "demo-cmd.md"), "tampered\n");
        const expected = expectedFiles(fx.sync, expandAssets(loadManifest(fx.sync)), {});
        const result = writeExpected(fx.root, expected);
        expect(result.written).toContain(".toolA/commands/demo-cmd.md");
        expect(readFileSync(join(fx.root, ".toolA", "commands", "demo-cmd.md"), "utf8")).toBe("demo cmd body\n");
    });
});
