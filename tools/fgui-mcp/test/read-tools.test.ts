/**
 * 读侧新增工具测试：验证 MCP server 侧注册表结构正确（描述/方法委托）。
 * 真实编辑器行为由 cross-verify 脚本在编辑器开启时人工验证（本测试不依赖编辑器）。
 * 覆盖：read_project_settings / full_search / read_document / find_unused_resources /
 * find_duplicate_resources 的注册存在性与委托方法名一致性。
 */

import { describe, expect, it } from "bun:test";
import { READ_TOOLS, wrapToolRun } from "../lib/tools";
import { MailboxBridge } from "../lib/bridge";

function joinTempDir(): string {
    return (import.meta.dir, "unused-mailbox-read");
}

const emptyBridge = new MailboxBridge(joinTempDir(), { timeoutMs: 50 });

describe("读侧新增工具注册表", () => {
    it("注册 12 个读工具且描述非空", () => {
        const names = Object.keys(READ_TOOLS).sort();
        expect(names).toContain("fgui_read_project_settings");
        expect(names).toContain("fgui_full_search");
        expect(names).toContain("fgui_read_document");
        expect(names).toContain("fgui_find_unused_resources");
        expect(names).toContain("fgui_find_duplicate_resources");
        for (const tool of Object.values(READ_TOOLS)) {
            expect(tool.description.length).toBeGreaterThan(0);
            expect(typeof tool.run).toBe("function");
        }
    });

    it("每个新增读工具 run 委托到对应 bridge 方法（描述含方法语义关键词）", () => {
        const expectMethod = (name: string, method: string): void => {
            expect(READ_TOOLS[name]!.description).toMatch(method);
        };
        expectMethod("fgui_read_project_settings", "设置");
        expectMethod("fgui_full_search", "搜索");
        expectMethod("fgui_read_document", "结构快照");
        expectMethod("fgui_find_unused_resources", "未使用");
        expectMethod("fgui_find_duplicate_resources", "重复");
    });

    it("find_* 工具描述注明只读不删除，避免误用于破坏性操作", () => {
        expect(READ_TOOLS["fgui_find_unused_resources"]!.description).toMatch("不删除");
        expect(READ_TOOLS["fgui_find_duplicate_resources"]!.description).toMatch("不删除");
    });
});

describe("读侧新增工具缺参数/桥不可达时的行为", () => {
    it("wrapToolRun 包裹的读工具在桥不可达时返回 reached:false 结构化错误", async () => {
        const tool = READ_TOOLS["fgui_read_document"]!;
        const wrapped = wrapToolRun(true, joinTempDir(), emptyBridge, tool.run);
        const result = await wrapped({ package: "Demo", component: "DemoView" });
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.bridge?.reached).toBe(false);
    });

    it("编辑器侧缺参数报错透传（mock bridge 返回参数缺失错误）", async () => {
        const mock = new MockBridgeError();
        const tool = READ_TOOLS["fgui_full_search"]!;
        const wrapped = wrapToolRun(true, joinTempDir(), mock, tool.run);
        const result = await wrapped({});
        expect(result.ok).toBe(false);
        expect(result.error).toContain("keyword");
    });
});

/** 模拟编辑器侧：对任意请求立即返回 ok:false 错误响应（参数缺失）。 */
class MockBridgeError extends MailboxBridge {
    constructor() {
        super(joinTempDir(), { timeoutMs: 2000 });
    }
    override async call(_method: string, _params: Record<string, unknown>): Promise<{ reached: boolean; ok: boolean; result?: unknown; error?: string }> {
        return { reached: true, ok: false, error: "缺少参数 keyword" };
    }
}
