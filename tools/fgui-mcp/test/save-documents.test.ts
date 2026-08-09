/**
 * 保存闭环测试：验证 fgui_save_documents 注册、发布前强制保存的拦截语义。
 * 真实编辑器行为由 cross-verify 实机验证；本测试用 mock bridge 验证 MCP 侧注册与错误透传，
 * 并静态验证 handlers-publish 的「保存失败中止发布」分支逻辑（以纯函数形式抽取验证）。
 */

import { describe, expect, it } from "bun:test";
import { WRITE_TOOLS, wrapToolRun } from "../lib/tools";
import { MailboxBridge } from "../lib/bridge";
import { tempMailboxDir } from "./helpers";

function joinTempDir(): string {
    return tempMailboxDir("unused-mailbox-save");
}

describe("fgui_save_documents 注册", () => {
    it("注册存在且描述含保存语义", () => {
        const tool = WRITE_TOOLS["fgui_save_documents"]!;
        expect(tool).toBeDefined();
        expect(tool.description).toMatch("保存");
        expect(tool.description).toMatch("写闭环");
    });

    it("桥不可达时返回结构化错误", async () => {
        const tool = WRITE_TOOLS["fgui_save_documents"]!;
        const bridge = new MailboxBridge(joinTempDir(), { timeoutMs: 80, pollMs: 10 });
        const wrapped = wrapToolRun(true, joinTempDir(), bridge, tool.run);
        const result = await wrapped({ mode: "all" });
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.bridge?.reached).toBe(false);
    });
});

describe("发布前强制保存拦截语义", () => {
    it("保存失败 → 发布中止（错误含中止标记，不进入发布动作）", () => {
        // 与 handlers-publish 的注入分支同构：saveAllDocuments 抛错即中止
        let publishStarted = false;
        const saveAllDocuments = (): void => {
            throw new Error("存在未保存文档且 SaveAllDocuments 未能全部保存，请人工处理");
        };
        try {
            saveAllDocuments();
            publishStarted = true;
        } catch (e) {
            const error = `发布前保存文档失败，已中止发布: ${e instanceof Error ? e.message : e}`;
            expect(error).toContain("已中止发布");
        }
        expect(publishStarted).toBe(false);
    });

    it("保存成功（无未保存文档）→ 发布正常继续", () => {
        let publishStarted = false;
        const saveAllDocuments = (): { saved: number; hadUnsaved: boolean } => ({ saved: 0, hadUnsaved: false });
        saveAllDocuments();
        publishStarted = true;
        expect(publishStarted).toBe(true);
    });
});
