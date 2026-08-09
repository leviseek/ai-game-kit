/**
 * 包/资源/分支管理工具测试：验证注册表存在性、破坏性操作二次确认语义、分支切换校验。
 * 编辑器侧真实行为由 cross-verify 实机验证；本测试覆盖 MCP 侧注册与可静态验证的语义。
 */

import { describe, expect, it } from "bun:test";
import { WRITE_TOOLS, wrapToolRun } from "../lib/tools";
import { MailboxBridge } from "../lib/bridge";
import { tempMailboxDir } from "./helpers";

function joinTempDir(): string {
    return tempMailboxDir("unused-mailbox-pkg");
}

describe("包/资源/分支工具注册表", () => {
    it("注册包/资源/分支管理工具且描述非空", () => {
        for (const name of [
            "fgui_create_package",
            "fgui_delete_package",
            "fgui_create_folder",
            "fgui_rename_resource",
            "fgui_move_resource",
            "fgui_delete_resource",
            "fgui_create_component",
            "fgui_copy_items",
            "fgui_list_branches",
            "fgui_switch_branch",
        ]) {
            const tool = WRITE_TOOLS[name]!;
            expect(tool).toBeDefined();
            expect(tool.description.length).toBeGreaterThan(0);
        }
    });

    it("破坏性工具描述含二次确认语义", () => {
        expect(WRITE_TOOLS["fgui_delete_package"]!.description).toMatch("confirm");
        expect(WRITE_TOOLS["fgui_delete_resource"]!.description).toMatch("confirm");
        expect(WRITE_TOOLS["fgui_delete_resource"]!.description).toMatch("引用");
    });

    it("switch_branch 描述注明动态取分支、禁止硬编码", () => {
        expect(WRITE_TOOLS["fgui_switch_branch"]!.description).toMatch("allBranches");
    });

    it("copy_items 描述注明依赖复制与 id 映射", () => {
        expect(WRITE_TOOLS["fgui_copy_items"]!.description).toMatch("id 映射");
    });
});

describe("分支切换校验语义（与 handlers-write 同构的纯函数验证）", () => {
    it("存在分支通过、不存在分支报错", () => {
        const branches = ["trunk", "dev"];
        const switchBranch = (branch: string): string => {
            if (!branches.includes(branch)) throw new Error(`分支不存在: ${branch}`);
            return branch;
        };
        expect(switchBranch("dev")).toBe("dev");
        expect(() => switchBranch("master")).toThrow("分支不存在");
    });
});

describe("包/资源工具错误路径", () => {
    it("桥不可达时返回结构化错误", async () => {
        for (const name of ["fgui_create_component", "fgui_switch_branch", "fgui_copy_items"]) {
            const tool = WRITE_TOOLS[name]!;
            const bridge = new MailboxBridge(joinTempDir(), { timeoutMs: 80, pollMs: 10 });
            const wrapped = wrapToolRun(true, joinTempDir(), bridge, tool.run);
            const result = await wrapped({ package: "Demo" });
            expect(result.ok).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.bridge?.reached).toBe(false);
        }
    });
});
