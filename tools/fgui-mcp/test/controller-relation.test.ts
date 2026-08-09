/**
 * 控制器与关系工具测试：验证注册表存在性、sidePair 校验语义、错误路径。
 * 编辑器侧真实行为由 cross-verify 实机验证；本测试覆盖 MCP 侧注册与可静态验证的校验逻辑。
 * sidePair 校验语义从 handlers-write 以纯函数形式复刻验证（与 tools/fgui validate 一致）。
 */

import { describe, expect, it } from "bun:test";
import { READ_TOOLS, WRITE_TOOLS, wrapToolRun } from "../lib/tools";
import { MailboxBridge } from "../lib/bridge";

function joinTempDir(): string {
    return (import.meta.dir, "unused-mailbox-controller");
}

/** 与 handlers-write 同构的 sidePair 校验纯函数（便于无编辑器测试）。 */
const SIDE_PAIR_BASE = new Set([
    "left", "right", "top", "bottom", "middle", "center", "width", "height",
    "leftext", "rightext", "topext", "bottomext",
]);

function isValidSidePair(pair: string): boolean {
    const match = /^([a-z]+?)(%)?-([a-z]+?)(%)?$/.exec(pair.trim());
    if (!match) return false;
    return SIDE_PAIR_BASE.has(match[1]) && SIDE_PAIR_BASE.has(match[3]);
}

function validateSidePair(sidePair: string): void {
    const pairs = sidePair.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    if (pairs.length === 0) throw new Error("sidePair 不能为空");
    if (pairs.length > 2) throw new Error(`sidePair 最多 2 项，收到 ${pairs.length} 项: ${sidePair}`);
    for (const pair of pairs) {
        if (!isValidSidePair(pair)) throw new Error(`非法 sidePair 项: ${pair}`);
    }
}

describe("控制器/关系工具注册表", () => {
    it("注册控制器读/写工具", () => {
        for (const name of [
            "fgui_list_controllers",
            "fgui_add_controller",
            "fgui_update_controller",
            "fgui_remove_controller",
            "fgui_switch_page",
            "fgui_set_relation",
            "fgui_remove_relation",
        ]) {
            const read = READ_TOOLS[name];
            const write = WRITE_TOOLS[name];
            const tool = read ?? write;
            expect(tool).toBeDefined();
            expect(tool!.description.length).toBeGreaterThan(0);
        }
    });

    it("list_controllers 是读工具（在 READ_TOOLS 中）", () => {
        expect(READ_TOOLS["fgui_list_controllers"]).toBeDefined();
    });
});

describe("sidePair 校验语义（与 handlers-write/validate 一致）", () => {
    it("合法 2 项通过", () => {
        expect(() => validateSidePair("width-width,height-height")).not.toThrow();
    });

    it("合法单项目通过", () => {
        expect(() => validateSidePair("center-center")).not.toThrow();
    });

    it("百分比合法", () => {
        expect(() => validateSidePair("width-width%")).not.toThrow();
    });

    it("ext 后缀合法", () => {
        expect(() => validateSidePair("leftext-right")).not.toThrow();
    });

    it("3 项被拒", () => {
        expect(() => validateSidePair("width-width,height-height,center-center")).toThrow("最多 2 项");
    });

    it("非法取值被拒", () => {
        expect(() => validateSidePair("foo-bar")).toThrow("非法");
    });
});

describe("控制器/关系工具错误路径", () => {
    it("桥不可达时返回结构化错误", async () => {
        for (const name of ["fgui_add_controller", "fgui_switch_page", "fgui_set_relation"]) {
            const tool = WRITE_TOOLS[name]!;
            const bridge = new MailboxBridge(joinTempDir(), { timeoutMs: 80, pollMs: 10 });
            const wrapped = wrapToolRun(true, joinTempDir(), bridge, tool.run);
            const result = await wrapped({ package: "Demo", doc: "DemoView" });
            expect(result.ok).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.bridge?.reached).toBe(false);
        }
    });
});
