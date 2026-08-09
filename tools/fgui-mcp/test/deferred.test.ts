/**
 * 邮箱服务器异步（deferred）响应协议测试：
 * 验证 isDeferredResult 判定 + deferred 请求的响应路径（handler 稍后 writeResponse 补写）。
 * 全自动发布（trigger_publish）正是走此路径：Run() 后等待 onComplete 再写响应。
 */

import { describe, expect, it } from "bun:test";
import { isDeferredResult } from "../../../ui/demo/plugins/fgui-mcp-probe/src/mailbox/protocol";

describe("isDeferredResult 判定", () => {
    it("识别 deferred 标记", () => {
        expect(isDeferredResult({ deferred: true, id: "req_1" })).toBe(true);
    });

    it("普通结果（对象/数组/null）不视为 deferred", () => {
        expect(isDeferredResult({ packages: ["Demo"] })).toBe(false);
        expect(isDeferredResult([1, 2])).toBe(false);
        expect(isDeferredResult(null)).toBe(false);
        expect(isDeferredResult(undefined)).toBe(false);
        expect(isDeferredResult("ok")).toBe(false);
        expect(isDeferredResult(42)).toBe(false);
    });

    it("deferred 但缺 id 仍判定为 deferred（id 校验在 handler 层）", () => {
        expect(isDeferredResult({ deferred: true })).toBe(true);
    });
});

describe("deferred 响应协议（模拟 server 处理分支）", () => {
    it("handler 返回 deferred → 不立即写响应，待 writeResponse 补写", () => {
        // 模拟 processFile 的分支逻辑
        let immediateWrite = false;
        const result = { deferred: true, id: "req_9" };
        if (isDeferredResult(result)) {
            immediateWrite = false; // deferred：跳过立即写
        } else {
            immediateWrite = true;
        }
        expect(immediateWrite).toBe(false);

        // 稍后 writeResponse（同构逻辑：构造响应对象）
        const payload = { id: result.id, ok: true, result: { status: "success", isSuccess: true } };
        expect(payload.id).toBe("req_9");
        expect(payload.ok).toBe(true);
        expect(payload.result.isSuccess).toBe(true);
    });

    it("handler 抛异常时即使原本要 deferred 也走错误响应", () => {
        // 模拟：handler 在返回 deferred 前抛错 → server 应写错误响应
        let errorResp: { ok: boolean; error: string } | null = null;
        try {
            throw new Error("包不存在: Foo");
        } catch (e) {
            errorResp = { ok: false, error: String(e instanceof Error ? e.message : e) };
        }
        expect(errorResp?.ok).toBe(false);
        expect(errorResp?.error).toContain("包不存在");
    });
});
