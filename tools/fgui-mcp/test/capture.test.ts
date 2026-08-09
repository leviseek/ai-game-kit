/**
 * 截图采集工具测试：验证 capture_preview 注册与桥错误路径。
 * 编辑器侧真实截图行为由 cross-verify 实机验证；本测试覆盖 MCP 侧注册与错误透传。
 */

import { describe, expect, it } from "bun:test";
import { WRITE_TOOLS, wrapToolRun } from "../lib/tools";
import { MailboxBridge } from "../lib/bridge";
import { tempMailboxDir } from "./helpers";

function joinTempDir(): string {
    return tempMailboxDir("unused-mailbox-capture");
}

describe("fgui_capture_preview 注册", () => {
    it("注册存在且描述注明截图/视觉验证", () => {
        const tool = WRITE_TOOLS["fgui_capture_preview"]!;
        expect(tool).toBeDefined();
        expect(tool.description).toMatch("截图");
        expect(tool.description).toMatch("visual-verifier");
    });

    it("描述注明不产生半截图像（失败即结构化错误）", () => {
        expect(WRITE_TOOLS["fgui_capture_preview"]!.description).toMatch("半截图像");
    });

    it("桥不可达时返回结构化错误（不产生图像文件）", async () => {
        const tool = WRITE_TOOLS["fgui_capture_preview"]!;
        const bridge = new MailboxBridge(joinTempDir(), { timeoutMs: 80, pollMs: 10 });
        const wrapped = wrapToolRun(true, joinTempDir(), bridge, tool.run);
        const result = await wrapped({});
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.bridge?.reached).toBe(false);
    });
});
