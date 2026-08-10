/**
 * 截图采集工具测试：验证 capture_preview 注册、参数归一化与桥错误路径。
 * 编辑器侧真实截图行为由 cross-verify 实机验证；本测试覆盖 MCP 侧注册、契约与错误透传。
 */

import { describe, expect, it } from "bun:test";
import { WRITE_TOOLS, wrapToolRun } from "../lib/tools";
import { MailboxBridge } from "../lib/bridge";
import { tempMailboxDir } from "./helpers";

function joinTempDir(): string {
    return tempMailboxDir("unused-mailbox-capture");
}

/** 记录转发参数的模拟桥：断言 MCP 工具层传给编辑器的参数契约。 */
class RecordingBridge extends MailboxBridge {
    lastMethod: string | undefined;
    lastParams: Record<string, unknown> | undefined;
    constructor() {
        super(joinTempDir(), { timeoutMs: 2000 });
    }
    override async call(method: string, params: Record<string, unknown>): Promise<{ reached: boolean; ok: boolean; result?: unknown; error?: string }> {
        this.lastMethod = method;
        this.lastParams = params;
        return { reached: true, ok: true, result: { captured: true } };
    }
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

describe("fgui_capture_preview 参数契约（component→doc 归一化）", () => {
    it("传 component 不传 doc 时，转发给编辑器的参数含归一化后的 doc（目标组件名）", async () => {
        const bridge = new RecordingBridge();
        const tool = WRITE_TOOLS["fgui_capture_preview"]!;
        const wrapped = wrapToolRun(true, joinTempDir(), bridge, tool.run);
        const result = await wrapped({ package: "AutoBattle", component: "AutoBattleView" });
        expect(result.ok).toBe(true);
        expect(bridge.lastMethod).toBe("capture_preview");
        // 契约：component 必须归一为 doc，避免编辑器侧静默回退截 App.activeDoc
        expect(bridge.lastParams).toMatchObject({
            package: "AutoBattle",
            doc: "AutoBattleView",
        });
    });

    it("显式传 doc 时保持原样，不被 component 覆盖", async () => {
        const bridge = new RecordingBridge();
        const tool = WRITE_TOOLS["fgui_capture_preview"]!;
        const wrapped = wrapToolRun(true, joinTempDir(), bridge, tool.run);
        const result = await wrapped({ package: "AutoBattle", component: "OtherView", doc: "AutoBattleView" });
        expect(result.ok).toBe(true);
        expect(bridge.lastParams).toMatchObject({
            package: "AutoBattle",
            doc: "AutoBattleView",
        });
    });

    it("两者都不传时不注入 doc（编辑器按活动文档截图，与规格一致）", async () => {
        const bridge = new RecordingBridge();
        const tool = WRITE_TOOLS["fgui_capture_preview"]!;
        const wrapped = wrapToolRun(true, joinTempDir(), bridge, tool.run);
        const result = await wrapped({ package: "AutoBattle" });
        expect(result.ok).toBe(true);
        expect(bridge.lastParams).toMatchObject({ package: "AutoBattle" });
        expect(bridge.lastParams?.["doc"]).toBeUndefined();
    });
});
