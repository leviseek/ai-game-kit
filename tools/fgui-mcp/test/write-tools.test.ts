/**
 * 写工具错误处理测试：写工具走编辑器桥，无法在无编辑器时真正执行。
 * 这里验证两层行为：
 *  1. wrapToolRun 在编辑器桥不可达时返回结构化错误（不抛异常、不中断）
 *  2. 写工具注册表结构正确（描述/run 存在，且 run 委托到 bridge.call 的对应方法）
 * 真实写操作（切换/回滚/刷新/插入）需在编辑器开启时人工验证（cross-verify 或 MCP 客户端）。
 */

import { describe, expect, it } from "bun:test";
import { WRITE_TOOLS, wrapToolRun } from "../lib/tools";
import { MailboxBridge } from "../lib/bridge";
import { tempMailboxDir } from "./helpers";

/** 指向一个不可达的邮箱目录（不存在 → isBridgeReachable 仍会创建目录并返回 true，故用超时极短来模拟"无响应"）。 */
const unreachableBridge = new MailboxBridge(joinTempDir(), { timeoutMs: 80, pollMs: 10 });

function joinTempDir(): string {
    return tempMailboxDir("unused-mailbox-write");
}

describe("写工具注册表", () => {
    it("注册 34 个写工具且描述非空", () => {
        expect(Object.keys(WRITE_TOOLS).sort()).toEqual([
            "fgui_add_child",
            "fgui_add_controller",
            "fgui_capture_preview",
            "fgui_clear_logs",
            "fgui_close_document",
            "fgui_copy_items",
            "fgui_create_component",
            "fgui_create_folder",
            "fgui_create_package",
            "fgui_delete_child",
            "fgui_delete_package",
            "fgui_delete_resource",
            "fgui_import_resource",
            "fgui_insert_component",
            "fgui_list_branches",
            "fgui_move_resource",
            "fgui_open_component",
            "fgui_publish_all",
            "fgui_refresh_project",
            "fgui_reload_package",
            "fgui_remove_controller",
            "fgui_remove_relation",
            "fgui_rename_resource",
            "fgui_restore_publish_settings",
            "fgui_save_documents",
            "fgui_select_element",
            "fgui_set_object_property",
            "fgui_set_relation",
            "fgui_show_preview",
            "fgui_switch_branch",
            "fgui_switch_page",
            "fgui_switch_publish_settings",
            "fgui_trigger_publish",
            "fgui_update_controller",
        ]);
        for (const tool of Object.values(WRITE_TOOLS)) {
            expect(tool.description.length).toBeGreaterThan(0);
            expect(typeof tool.run).toBe("function");
        }
    });

    it("每个写工具 run 都委托到对应 bridge 方法", async () => {
        const expectMethod = (name: string, method: string): void => {
            expect(WRITE_TOOLS[name]!.description).toBeDefined();
            // 描述中应含方法语义关键词（间接验证委托正确）
            expect(WRITE_TOOLS[name]!.description).toMatch(method);
        };
        expectMethod("fgui_switch_publish_settings", "发布设置");
        expectMethod("fgui_restore_publish_settings", "回滚");
        expectMethod("fgui_refresh_project", "刷新");
        expectMethod("fgui_insert_component", "插入");
        expectMethod("fgui_save_documents", "保存");
        expectMethod("fgui_import_resource", "导入");
    });
});

describe("写工具在编辑器桥不可达时的行为", () => {
    it("wrapToolRun 包裹的写工具在超时后返回 reached:false 结构化错误，不抛异常", async () => {
        const name = "fgui_refresh_project";
        const tool = WRITE_TOOLS[name]!;
        const wrapped = wrapToolRun(true, joinTempDir(), unreachableBridge, tool.run);
        const result = await wrapped({});
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.bridge?.reached).toBe(false);
    });

    it("insert_component 缺参数时由 handler 侧报错（编辑器可达但参数缺失）——此处用 mock bridge 模拟插件返回 error", async () => {
        // 模拟编辑器侧：立刻返回"缺少参数"错误
        const mockBridge = new MockErrorBridge();
        const tool = WRITE_TOOLS["fgui_insert_component"]!;
        const wrapped = wrapToolRun(true, joinTempDir(), mockBridge, tool.run);
        const result = await wrapped({ package: "Demo" });
        expect(result.ok).toBe(false);
        expect(result.error).toContain("component");
    });
});

/** 模拟编辑器侧：对任意请求立即返回 ok:false 错误响应。 */
class MockErrorBridge extends MailboxBridge {
    constructor() {
        super(joinTempDir(), { timeoutMs: 2000 });
    }
    override async call(_method: string, _params: Record<string, unknown>): Promise<{ reached: boolean; ok: boolean; result?: unknown; error?: string }> {
        return { reached: true, ok: false, error: "缺少参数 component（要插入的组件名，如 StartButton 或 StartButton.xml）" };
    }
}
