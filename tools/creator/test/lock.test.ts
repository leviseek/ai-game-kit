import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { acquireLock, releaseLock } from "../lib/lock";

describe("文件锁（真实 temp 目录 + 唯一锁名，不污染既有锁）", () => {
    const lockName = `creator-test-${process.pid}-${Math.random().toString(36).slice(2)}`;

    beforeEach(() => {
        releaseLock(lockName); // 清理可能残留
    });
    afterEach(() => {
        releaseLock(lockName);
    });

    it("首次获取成功，重复获取被拒（活锁）", () => {
        expect(acquireLock(lockName)).toBe(true);
        expect(acquireLock(lockName)).toBe(false);
    });

    it("释放后可再次获取", () => {
        expect(acquireLock(lockName)).toBe(true);
        releaseLock(lockName);
        expect(acquireLock(lockName)).toBe(true);
    });

    it("僵尸锁（PID 不存在）自动清除并获取成功", () => {
        // 预置一个 pid 指向不存在进程的锁目录
        const dir = join(process.cwd(), "temp", "creator", "locks", `${lockName}.lock`);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "pid"), "999999999", "utf8"); // 不存在进程
        expect(acquireLock(lockName)).toBe(true);
        expect(existsSync(dir)).toBe(true); // 僵尸被清除后重建，仍持有
    });
});
