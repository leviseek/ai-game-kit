/**
 * 邮箱桥接协议测试：用模拟"编辑器侧"（模拟插件行为）验证 MailboxBridge 的
 * 请求/响应闭环、超时、错误路径。不依赖真实编辑器。
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MailboxBridge } from "../lib/bridge";

let mailboxDir: string;

/** 模拟编辑器侧：从 requests 目录读取请求并写响应到 responses 目录。 */
function mockEditorSide(request: (raw: string) => string): void {
    const requestsDir = join(mailboxDir, "requests");
    const responsesDir = join(mailboxDir, "responses");
    for (const name of readdirSync(requestsDir)) {
        if (!name.endsWith(".json")) continue;
        const raw = readFileSync(join(requestsDir, name), "utf8");
        const resp = request(raw);
        writeFileSync(join(responsesDir, name.replace(/\.json$/, "") + ".json"), resp);
    }
}

beforeEach(() => {
    mailboxDir = mkdtempSync(join(tmpdir(), "fgui-mcp-bridge-"));
});

afterEach(() => {
    rmSync(mailboxDir, { recursive: true, force: true });
});

describe("MailboxBridge 协议闭环", () => {
    it("请求-响应闭环：写请求 → 读到响应", async () => {
        const bridge = new MailboxBridge(mailboxDir, { pollMs: 10, timeoutMs: 2000 });
        const promise = bridge.call("list_packages", {});
        // 模拟编辑器侧立即响应
        setTimeout(() => mockEditorSide((raw) => {
            const req = JSON.parse(raw) as { id: string };
            return JSON.stringify({ id: req.id, ok: true, result: [{ name: "Demo", id: "4q9x2uij", opened: true }] });
        }), 20);

        const result = await promise;
        expect(result.reached).toBe(true);
        expect(result.ok).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.result).toEqual([{ name: "Demo", id: "4q9x2uij", opened: true }]);
    });

    it("插件返回 error 时透传错误", async () => {
        const bridge = new MailboxBridge(mailboxDir, { pollMs: 10, timeoutMs: 2000 });
        const promise = bridge.call("list_resources", { package: "Demo" });
        setTimeout(() => mockEditorSide((raw) => {
            const req = JSON.parse(raw) as { id: string };
            return JSON.stringify({ id: req.id, ok: false, error: "包不存在: Foo" });
        }), 20);

        const result = await promise;
        expect(result.reached).toBe(true);
        expect(result.ok).toBe(false);
        expect(result.error).toBe("包不存在: Foo");
    });

    it("编辑器不可达（无人响应）时超时返回 reached=false，不抛异常", async () => {
        const bridge = new MailboxBridge(mailboxDir, { pollMs: 10, timeoutMs: 150 });
        const result = await bridge.call("list_packages", {});
        expect(result.reached).toBe(false);
        expect(result.ok).toBe(false);
        expect(result.error).toContain("超时");
        // 残留请求文件被清理
        expect(readdirSync(join(mailboxDir, "requests")).filter((n) => n.endsWith(".json")).length).toBe(0);
    });

    it("响应文件半写时解析失败返回结构化错误", async () => {
        const bridge = new MailboxBridge(mailboxDir, { pollMs: 10, timeoutMs: 2000 });
        const promise = bridge.call("list_packages", {});
        setTimeout(() => mockEditorSide((_raw) => {
            return "{ not valid json";
        }), 20);

        const result = await promise;
        expect(result.reached).toBe(true);
        expect(result.ok).toBe(false);
        expect(result.error).toContain("解析失败");
    });

    it("请求先写 tmp 再改名，响应即读即删", async () => {
        const bridge = new MailboxBridge(mailboxDir, { pollMs: 10, timeoutMs: 2000 });
        const promise = bridge.call("list_packages", {});
        // 第一次轮询前检查：请求目录存在 .json（已改名完成）
        await new Promise((r) => setTimeout(r, 30));
        const reqFiles = readdirSync(join(mailboxDir, "requests")).filter((n) => n.endsWith(".json"));
        expect(reqFiles.length).toBe(1);
        setTimeout(() => mockEditorSide((raw) => {
            const req = JSON.parse(raw) as { id: string };
            return JSON.stringify({ id: req.id, ok: true, result: [] });
        }), 40);

        await promise;
        // 响应即读即删
        expect(readdirSync(join(mailboxDir, "responses")).filter((n) => n.endsWith(".json")).length).toBe(0);
    });
});
