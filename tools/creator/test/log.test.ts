import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readTextWithRetry, sleep, waitForPattern } from "../lib/log";

describe("sleep", () => {
    it("至少等待指定时长", async () => {
        const start = Date.now();
        await sleep(10);
        expect(Date.now() - start).toBeGreaterThanOrEqual(8);
    });
});

describe("readTextWithRetry", () => {
    it("正常读取文本", () => {
        const dir = mkdtempSync(join(tmpdir(), "creator-log-"));
        try {
            const file = join(dir, "a.txt");
            writeFileSync(file, "hello", "utf8");
            expect(readTextWithRetry(file, 1, 0)).toBe("hello");
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("重试耗尽后抛「无法读取」错误", () => {
        expect(() => readTextWithRetry(join("Z:\\nonexistent", "x.log"), 2, 0)).toThrow(/无法读取/);
    });
});

describe("waitForPattern", () => {
    it("匹配即返回 true", async () => {
        const ok = await waitForPattern(() => "build Task Finished", /Finished/, 500, 10);
        expect(ok).toBe(true);
    });

    it("超时未匹配返回 false", async () => {
        const ok = await waitForPattern(() => "still building", /Finished/, 30, 5);
        expect(ok).toBe(false);
    });
});
