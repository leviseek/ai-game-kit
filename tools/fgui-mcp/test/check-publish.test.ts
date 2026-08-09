/**
 * 发布一致性检测测试：三重证据（信号 + 产物新鲜度 + validate --strict）。
 * 用临时目录构造"源/产物/信号"三类文件，验证 checkPackageArtifacts 与 checkPublish 的判定逻辑。
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkPackageArtifacts, readSignal, runValidateAggregated } from "../lib/check-publish";

let root: string;
let artifactsDir: string;
let sourcesDir: string;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "fgui-mcp-check-"));
    artifactsDir = join(root, "artifacts");
    sourcesDir = join(root, "sources");
    mkdirSync(artifactsDir, { recursive: true });
    mkdirSync(sourcesDir, { recursive: true });
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe("readSignal", () => {
    it("不存在返回 null", () => {
        expect(readSignal(join(root, "publish-signal.json"))).toBeNull();
    });

    it("解析合法 JSON 信号", () => {
        const p = join(root, "publish-signal.json");
        writeFileSync(p, JSON.stringify({ ok: true, ts: "2026-08-10T00:00:00Z", packages: ["Demo"], exportPath: "x", isSuccess: true }));
        const signal = readSignal(p);
        expect(signal?.packages).toEqual(["Demo"]);
        expect(signal?.isSuccess).toBe(true);
    });

    it("非法 JSON 返回 null", () => {
        const p = join(root, "publish-signal.json");
        writeFileSync(p, "{ not json");
        expect(readSignal(p)).toBeNull();
    });
});

describe("checkPackageArtifacts（产物新鲜度）", () => {
    it("产物新鲜（晚于源最新 mtime）→ ok", () => {
        writeFileSync(join(sourcesDir, "DemoView.xml"), "<component/>");
        const oldT = new Date(Date.now() - 60_000);
        utimesSync(join(sourcesDir, "DemoView.xml"), oldT, oldT);
        // 产物目录：建 pkg 目录 + 假 .bin（mtime 最新）
        mkdirSync(join(artifactsDir, "Demo"), { recursive: true });
        writeFileSync(join(artifactsDir, "Demo", "Demo.bin"), "bin");
        const result = checkPackageArtifacts(artifactsDir, sourcesDir, "Demo");
        expect(result.ok).toBe(true);
        expect(result.mismatches).toEqual([]);
    });

    it("产物陈旧（早于源最新 mtime）→ 标记差异", () => {
        mkdirSync(join(artifactsDir, "Demo"), { recursive: true });
        writeFileSync(join(artifactsDir, "Demo", "Demo.bin"), "bin");
        const oldT = new Date(Date.now() - 120_000);
        utimesSync(join(artifactsDir, "Demo", "Demo.bin"), oldT, oldT);
        // 源文件 mtime 更新
        writeFileSync(join(sourcesDir, "DemoView.xml"), "<component/>");
        const result = checkPackageArtifacts(artifactsDir, sourcesDir, "Demo");
        expect(result.ok).toBe(false);
        expect(result.mismatches.some((m) => m.includes("早于源"))).toBe(true);
    });

    it("产物缺失 → 标记差异", () => {
        const result = checkPackageArtifacts(artifactsDir, sourcesDir, "Demo");
        expect(result.ok).toBe(false);
        expect(result.mismatches.some((m) => m.includes("无发布产物"))).toBe(true);
    });
});

describe("runValidateAggregated（逐包 validate 聚合，多包不 join）", () => {
    it("全部包通过 → passed", () => {
        const cli = (_args: string[]): { exitCode: number; stdout: string; stderr: string } => ({ exitCode: 0, stdout: "校验通过", stderr: "" });
        const result = runValidateAggregated(["Demo", "Common"], cli);
        expect(result.passed).toBe(true);
        expect(result.details).toContain("全部目标包");
    });

    it("单个包失败 → 聚合明细含包名", () => {
        const cli = (args: string[]): { exitCode: number; stdout: string; stderr: string } =>
            args.includes("Bad")
                ? { exitCode: 1, stdout: "Bad 校验失败", stderr: "" }
                : { exitCode: 0, stdout: "校验通过", stderr: "" };
        const result = runValidateAggregated(["Demo", "Bad"], cli);
        expect(result.passed).toBe(false);
        expect(result.details).toContain("Bad");
    });

    it("每个包单独调用 CLI（不 join 多包为一个 --package）", () => {
        const calls: string[][] = [];
        const cli = (args: string[]): { exitCode: number; stdout: string; stderr: string } => {
            calls.push(args);
            return { exitCode: 0, stdout: "", stderr: "" };
        };
        runValidateAggregated(["Demo", "Common"], cli);
        expect(calls).toHaveLength(2);
        for (const call of calls) {
            expect(call.filter((a) => a === "Demo" || a === "Common").length).toBe(1);
            expect(call.join(" ")).not.toContain("Demo,Common");
        }
    });
});
