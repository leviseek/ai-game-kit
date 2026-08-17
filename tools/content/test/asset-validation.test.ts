import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateAssetFiles, validateExplosionFrames } from "../lib/asset-validation";
import type { TableSchema } from "../lib/schemas";

/** 与真实 unit-animations 同构的 fixture schema。 */
const ANIM_SCHEMA: TableSchema = {
    table: "unit-animations",
    file: "game-content/unit-animations.json",
    shape: "array",
    assets: { bundleDir: "animations", dirField: "dir", prefixField: "prefixByAnim", countField: "frameCount", countByAnimField: "frameCountByAnim" },
    fields: [],
};

function writeFrame(root: string, rel: string): void {
    const full = join(root, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, "frame");
}

describe("validateAssetFiles", () => {
    let root: string;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), "asset-test-"));
        mkdirSync(join(root, "assets", "animations", "auto-battle"), { recursive: true });
    });
    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it("帧文件齐全通过", () => {
        writeFrame(root, "assets/animations/auto-battle/warrior_f_idle_00.png");
        writeFrame(root, "assets/animations/auto-battle/warrior_f_idle_01.png");
        const rows = [{ id: "w", dir: "auto-battle", frameCount: 2, prefixByAnim: { idle: "warrior_f_idle" } }];
        expect(validateAssetFiles(root, ANIM_SCHEMA, rows)).toHaveLength(0);
    });

    it("缺失帧报 asset-frame-missing（含动画名与期望路径）", () => {
        writeFrame(root, "assets/animations/auto-battle/warrior_f_idle_00.png");
        const rows = [{ id: "w", dir: "auto-battle", frameCount: 2, prefixByAnim: { idle: "warrior_f_idle" } }];
        const issues = validateAssetFiles(root, ANIM_SCHEMA, rows);
        const hit = issues.find((i) => i.code === "asset-frame-missing");
        expect(hit).toBeDefined();
        expect(hit?.message).toContain("idle warrior_f_idle_01.png");
    });

    it("按动画独立帧数展开文件", () => {
        writeFrame(root, "assets/animations/auto-battle/walk_00.png");
        writeFrame(root, "assets/animations/auto-battle/walk_01.png");
        writeFrame(root, "assets/animations/auto-battle/hit_00.png");
        const rows = [
            {
                id: "w",
                dir: "auto-battle",
                frameCount: 9,
                frameCountByAnim: { walk: 2, hit: 1 },
                prefixByAnim: { walk: "walk", hit: "hit" },
            },
        ];
        expect(validateAssetFiles(root, ANIM_SCHEMA, rows)).toHaveLength(0);
    });

    it("子目录缺失报 asset-dir-missing", () => {
        const rows = [{ id: "w", dir: "ghost-dir", frameCount: 1, prefixByAnim: { idle: "x" } }];
        expect(validateAssetFiles(root, ANIM_SCHEMA, rows).some((i) => i.code === "asset-dir-missing")).toBe(true);
    });

    it("bundle 目录缺失报 asset-bundle-missing", () => {
        rmSync(join(root, "assets", "animations"), { recursive: true, force: true });
        const rows = [{ id: "w", dir: "auto-battle", frameCount: 1, prefixByAnim: { idle: "x" } }];
        expect(validateAssetFiles(root, ANIM_SCHEMA, rows).some((i) => i.code === "asset-bundle-missing")).toBe(true);
    });
});

describe("validateExplosionFrames", () => {
    let root: string;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), "fx-test-"));
        mkdirSync(join(root, "assets", "animations", "auto-battle"), { recursive: true });
    });
    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it("爆炸帧齐全通过（fx_explosion_00..11）", () => {
        for (let i = 0; i < 12; i++) {
            writeFrame(root, `assets/animations/auto-battle/fx_explosion_${String(i).padStart(2, "0")}.png`);
        }
        expect(validateExplosionFrames(root, [{ id: "e", kind: "explosion" }])).toHaveLength(0);
    });

    it("缺失爆炸帧报错", () => {
        writeFrame(root, "assets/animations/auto-battle/fx_explosion_00.png");
        const issues = validateExplosionFrames(root, [{ id: "e", kind: "explosion" }]);
        expect(issues.some((i) => i.code === "asset-frame-missing" && i.message.includes("fx_explosion_11.png"))).toBe(true);
    });

    it("无 explosion 条目给 warning（不阻断）", () => {
        const issues = validateExplosionFrames(root, [{ id: "x", kind: "heal" }]);
        expect(issues.some((i) => i.code === "asset-kind-unused" && i.severity === "warning")).toBe(true);
    });
});
