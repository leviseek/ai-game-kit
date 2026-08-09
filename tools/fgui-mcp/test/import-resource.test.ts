/**
 * 资源导入工具测试：验证 import_resource 注册、参数校验与桥错误透传。
 * 编辑器侧真实导入行为由 cross-verify 实机验证；本测试验证 MCP 侧参数约束与错误路径。
 */

import { describe, expect, it } from "bun:test";
import { WRITE_TOOLS, wrapToolRun } from "../lib/tools";
import { MailboxBridge } from "../lib/bridge";
import { tempMailboxDir } from "./helpers";

function joinTempDir(): string {
    return tempMailboxDir("unused-mailbox-import");
}

describe("fgui_import_resource 注册", () => {
    it("注册存在且描述含批量语义", () => {
        const tool = WRITE_TOOLS["fgui_import_resource"]!;
        expect(tool).toBeDefined();
        expect(tool.description).toMatch("导入");
        expect(tool.description).toMatch("批量");
        expect(tool.description).toMatch("不整体回滚");
    });

    it("缺 files 参数时由 handler 报错（mock bridge 模拟参数缺失错误）", async () => {
        const mock = new MockBridgeParamError();
        const tool = WRITE_TOOLS["fgui_import_resource"]!;
        const wrapped = wrapToolRun(true, joinTempDir(), mock, tool.run);
        const result = await wrapped({ package: "Demo" });
        expect(result.ok).toBe(false);
        expect(result.error).toContain("files");
    });

    it("桥不可达时返回结构化错误", async () => {
        const tool = WRITE_TOOLS["fgui_import_resource"]!;
        const bridge = new MailboxBridge(joinTempDir(), { timeoutMs: 80, pollMs: 10 });
        const wrapped = wrapToolRun(true, joinTempDir(), bridge, tool.run);
        const result = await wrapped({ package: "Demo", files: ["a.png"] });
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.bridge?.reached).toBe(false);
    });
});

/** 模拟编辑器侧：返回缺 files 参数错误。 */
class MockBridgeParamError extends MailboxBridge {
    constructor() {
        super(joinTempDir(), { timeoutMs: 2000 });
    }
    override async call(_method: string, _params: Record<string, unknown>): Promise<{ reached: boolean; ok: boolean; result?: unknown; error?: string }> {
        return { reached: true, ok: false, error: "缺少参数 files（至少一个文件路径）" };
    }
}
