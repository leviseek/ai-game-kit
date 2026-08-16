import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureCodeGraphIndex } from "../lib/codegraph/gateway";
import type { CommandResult } from "../lib/codegraph/process";

/** 记录式 fake runner：按 args 前缀分派响应；收集全部调用。 */
function fakeRunner(responses: Record<string, CommandResult>, calls: string[][]): (args: string[]) => Promise<CommandResult> {
    return async (args) => {
        calls.push([...args]);
        const key = args[0] ?? "";
        const hit = responses[key];
        if (hit === undefined) throw new Error(`未预期的调用: ${args.join(" ")}`);
        return hit;
    };
}

const OK = (stdout = ""): CommandResult => ({ exitCode: 0, stdout, stderr: "" });

/** 合法 status JSON（reindexRecommended 可注入）。 */
function statusJson(reindexRecommended: boolean): string {
    return JSON.stringify({
        initialized: true,
        version: "1.5.0",
        projectPath: "p",
        indexPath: "i",
        lastIndexed: null,
        index: { builtWithVersion: "v", builtWithExtractionVersion: 1, currentExtractionVersion: 1, reindexRecommended, state: "ready", pendingRefs: 0 },
    });
}

describe("ensureCodeGraphIndex（三态 + 容错）", () => {
    let root: string;
    let dbPath: string;
    const calls: string[][] = [];

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), "arch-ensure-"));
        dbPath = join(root, ".codegraph", "codegraph.db");
        mkdirSync(join(root, ".codegraph"), { recursive: true });
        calls.length = 0;
    });
    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it("索引缺失 → 自动 codegraph init", async () => {
        const runner = fakeRunner({ init: OK() }, calls);
        await ensureCodeGraphIndex({ projectRoot: root, dbPath, runner });
        expect(calls.map((c) => c[0])).toEqual(["init"]);
        expect(calls[0]?.[1]).toBe(root);
    });

    it("索引存在且 status 正常（reindexRecommended=false）→ 不重建", async () => {
        writeFileSync(dbPath, "db");
        const runner = fakeRunner({ status: OK(statusJson(false)) }, calls);
        await ensureCodeGraphIndex({ projectRoot: root, dbPath, runner });
        expect(calls.map((c) => c[0])).toEqual(["status"]);
    });

    it("索引存在但 status 报 reindexRecommended=true → 自动重建", async () => {
        writeFileSync(dbPath, "db");
        const runner = fakeRunner({ status: OK(statusJson(true)), init: OK() }, calls);
        await ensureCodeGraphIndex({ projectRoot: root, dbPath, runner });
        expect(calls.map((c) => c[0])).toEqual(["status", "init"]);
    });

    it("--refresh 强制重建（即使索引存在）", async () => {
        writeFileSync(dbPath, "db");
        const runner = fakeRunner({ init: OK() }, calls);
        await ensureCodeGraphIndex({ projectRoot: root, dbPath, runner, forceRefresh: true });
        expect(calls.map((c) => c[0])).toEqual(["init"]);
    });

    it("索引缺失且 CLI 未安装 → 透传类型化指引错误", async () => {
        const runner = async () => {
            throw new Error("codegraph CLI 未安装或不在 PATH：请先运行 `npm i -g codegraph`…");
        };
        await expect(ensureCodeGraphIndex({ projectRoot: root, dbPath, runner })).rejects.toThrow(/codegraph CLI 未安装/);
    });

    it("索引存在但 CLI 未安装 → 容错继续（不阻断使用既有索引）", async () => {
        writeFileSync(dbPath, "db");
        const runner = async () => {
            throw new Error("codegraph CLI 未安装或不在 PATH");
        };
        await expect(ensureCodeGraphIndex({ projectRoot: root, dbPath, runner })).resolves.toBeUndefined();
    });

    it("init 非零退出 → 抛 CodeGraphCommandError", async () => {
        const runner = fakeRunner({ init: { exitCode: 2, stdout: "", stderr: "boom" } }, calls);
        await expect(ensureCodeGraphIndex({ projectRoot: root, dbPath, runner })).rejects.toThrow(/CodeGraph command failed/);
    });
});
