/**
 * 工具透传一致性测试：验证 MCP 读工具（fgui_validate_package 等走 fgui CLI 的）结果
 * 与 `bun run fgui validate` 输出一致。编辑器侧读工具（list_packages 等）需要真实编辑器，
 * 由交叉验证脚本（test/cross-verify.ts）在编辑器开启时人工执行。
 */

import { describe, expect, it } from "bun:test";
import { READ_TOOLS } from "../lib/tools";
import { MailboxBridge } from "../lib/bridge";
import { tempMailboxDir } from "./helpers";

/** 空的 MailboxBridge 占位（validate 工具不经过 bridge）。 */
const emptyBridge = new MailboxBridge(joinTempDir(), { timeoutMs: 50 });

function joinTempDir(): string {
    return tempMailboxDir("unused-mailbox");
}

describe("fgui_validate_package 工具（透传 fgui CLI）", () => {
    it("Demo 包默认校验通过（exitCode 0 → ok:true）", async () => {
        const tool = READ_TOOLS["fgui_validate_package"]!;
        const result = await tool.run(emptyBridge, { package: "Demo" });
        expect(result.ok).toBe(true);
        expect(result.error).toBeUndefined();
        expect(String(result.data)).toContain("校验通过");
    });

    it("不存在的包返回结构化错误", async () => {
        const tool = READ_TOOLS["fgui_validate_package"]!;
        const result = await tool.run(emptyBridge, { package: "NonExistent" });
        expect(result.ok).toBe(false);
        expect(result.error).toContain("包不存在");
    });

    it("缺 package 参数返回明确错误", async () => {
        const tool = READ_TOOLS["fgui_validate_package"]!;
        const result = await tool.run(emptyBridge, {});
        expect(result.ok).toBe(false);
        expect(result.error).toContain("缺少参数 package");
    });

    it("官方库包按名默认豁免；--strict 需真实包", async () => {
        const tool = READ_TOOLS["fgui_validate_package"]!;
        // 官方库包 Basic/Builder 已移出主仓库（由 third-party/fairygui 子模块提供），
        // 默认模式按名豁免：即使包不存在也返回 ok 与「默认豁免」提示
        const normal = await tool.run(emptyBridge, { package: "Basic" });
        expect(normal.ok).toBe(true);
        expect(String(normal.data)).toContain("默认豁免");
        // --strict 全量检查要求真实包：主仓库无 Basic 包 → 结构化错误「包不存在」
        const strict = await tool.run(emptyBridge, { package: "Basic", strict: true });
        expect(strict.ok).toBe(false);
        expect(strict.error).toContain("包不存在");
    });
});
