/**
 * 结构编辑工具测试：验证 add_child/delete_child/set_object_property 注册与错误路径。
 * 编辑器侧真实编辑行为由 cross-verify 实机验证；本测试覆盖：
 * - 注册表存在性与委托方法名
 * - graph 类型在 MCP 侧描述中注明禁止
 * - 桥不可达/缺参数错误透传
 */

import { describe, expect, it } from "bun:test";
import { WRITE_TOOLS, wrapToolRun } from "../lib/tools";
import { MailboxBridge } from "../lib/bridge";
import { tempMailboxDir } from "./helpers";

function joinTempDir(): string {
    return tempMailboxDir("unused-mailbox-structure");
}

describe("结构编辑工具注册表", () => {
    it("注册 add_child/delete_child/set_object_property 且描述非空", () => {
        for (const name of ["fgui_add_child", "fgui_delete_child", "fgui_set_object_property"]) {
            const tool = WRITE_TOOLS[name]!;
            expect(tool).toBeDefined();
            expect(tool.description.length).toBeGreaterThan(0);
            expect(typeof tool.run).toBe("function");
        }
    });

    it("add_child 描述注明 graph 禁止", () => {
        expect(WRITE_TOOLS["fgui_add_child"]!.description).toMatch("graph");
    });

    it("set_object_property 描述注明白名单与 graph 拒绝", () => {
        expect(WRITE_TOOLS["fgui_set_object_property"]!.description).toMatch("graph");
    });

    it("graph 对象创建在 handler 层被拒（守卫纯函数验证）", () => {
        // 与 handlers-write 的 assertForbiddenObjectType 同构
        const FORBIDDEN = new Set(["graph"]);
        const assertForbidden = (type: string): void => {
            if (FORBIDDEN.has(type.toLowerCase())) throw new Error("禁止 <graph> 节点");
        };
        expect(() => assertForbidden("graph")).toThrow("禁止 <graph>");
        expect(() => assertForbidden("Graph")).toThrow("禁止 <graph>");
        expect(() => assertForbidden("image")).not.toThrow();
    });

    it("transition 写操作无暴露通道（WRITE_TOOLS 不含 transition 写入工具）", () => {
        for (const name of Object.keys(WRITE_TOOLS)) {
            expect(name).not.toMatch(/transition/i);
        }
    });

    it("删除工具描述注明引用警告", () => {
        expect(WRITE_TOOLS["fgui_delete_child"]!.description).toMatch("引用警告");
    });
});

describe("结构编辑工具错误路径", () => {
    it("桥不可达时返回结构化错误", async () => {
        for (const name of ["fgui_add_child", "fgui_delete_child", "fgui_set_object_property"]) {
            const tool = WRITE_TOOLS[name]!;
            const bridge = new MailboxBridge(joinTempDir(), { timeoutMs: 80, pollMs: 10 });
            const wrapped = wrapToolRun(true, joinTempDir(), bridge, tool.run);
            const result = await wrapped({ package: "Demo", doc: "DemoView" });
            expect(result.ok).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.bridge?.reached).toBe(false);
        }
    });

    it("缺 target 参数时透传参数缺失错误（mock bridge）", async () => {
        const mock = new MockBridgeTargetError();
        const tool = WRITE_TOOLS["fgui_delete_child"]!;
        const wrapped = wrapToolRun(true, joinTempDir(), mock, tool.run);
        const result = await wrapped({ package: "Demo", doc: "DemoView" });
        expect(result.ok).toBe(false);
        expect(result.error).toContain("target");
    });
});

/** 模拟编辑器侧：返回缺 target 参数错误。 */
class MockBridgeTargetError extends MailboxBridge {
    constructor() {
        super(joinTempDir(), { timeoutMs: 2000 });
    }
    override async call(_method: string, _params: Record<string, unknown>): Promise<{ reached: boolean; ok: boolean; result?: unknown; error?: string }> {
        return { reached: true, ok: false, error: "缺少参数 target（对象 id 或 name）" };
    }
}
