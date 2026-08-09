/**
 * FairyGUI-MCP 移植工具测试：验证 open_component/show_preview/get_selection/select_element/
 * close_document/get_component_info/get_logs/clear_logs/publish_all 的注册存在性与桥错误路径。
 * 编辑器侧真实行为由 cross-verify 实机验证；本测试覆盖 MCP 侧注册与错误透传。
 */

import { describe, expect, it } from "bun:test";
import { READ_TOOLS, WRITE_TOOLS, wrapToolRun } from "../lib/tools";
import { MailboxBridge } from "../lib/bridge";

function joinTempDir(): string {
    return (import.meta.dir, "unused-mailbox-fgui-mcp");
}

describe("FairyGUI-MCP 移植工具注册表", () => {
    it("注册读侧工具（get_selection/get_component_info/get_logs）", () => {
        for (const name of ["fgui_get_selection", "fgui_get_component_info", "fgui_get_logs"]) {
            expect(READ_TOOLS[name]).toBeDefined();
            expect(READ_TOOLS[name]!.description.length).toBeGreaterThan(0);
        }
    });

    it("注册写侧工具（open_component/show_preview/select_element/close_document/clear_logs/publish_all）", () => {
        for (const name of [
            "fgui_open_component",
            "fgui_show_preview",
            "fgui_select_element",
            "fgui_close_document",
            "fgui_clear_logs",
            "fgui_publish_all",
        ]) {
            expect(WRITE_TOOLS[name]).toBeDefined();
            expect(WRITE_TOOLS[name]!.description.length).toBeGreaterThan(0);
        }
    });

    it("publish_all 描述注明批量发布与 exclude", () => {
        expect(WRITE_TOOLS["fgui_publish_all"]!.description).toMatch("全部包");
        expect(WRITE_TOOLS["fgui_publish_all"]!.description).toMatch("exclude");
    });

    it("show_preview 描述注明参考来源", () => {
        expect(WRITE_TOOLS["fgui_show_preview"]!.description).toMatch("预览");
    });
});

describe("移植工具错误路径", () => {
    it("桥不可达时返回结构化错误", async () => {
        for (const name of ["fgui_open_component", "fgui_show_preview", "fgui_publish_all"]) {
            const tool = WRITE_TOOLS[name]!;
            const bridge = new MailboxBridge(joinTempDir(), { timeoutMs: 80, pollMs: 10 });
            const wrapped = wrapToolRun(true, joinTempDir(), bridge, tool.run);
            const result = await wrapped({ package: "Demo", component: "DemoView" });
            expect(result.ok).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.bridge?.reached).toBe(false);
        }
    });

    it("读侧工具桥不可达也返回结构化错误", async () => {
        const tool = READ_TOOLS["fgui_get_selection"]!;
        const bridge = new MailboxBridge(joinTempDir(), { timeoutMs: 80, pollMs: 10 });
        const wrapped = wrapToolRun(true, joinTempDir(), bridge, tool.run);
        const result = await wrapped({});
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.bridge?.reached).toBe(false);
    });
});
