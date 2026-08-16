import { describe, expect, it } from "bun:test";
import { buildKillChromeCommand } from "../lib/proc";

describe("buildKillChromeCommand（过滤逻辑，不执行 PowerShell）", () => {
    it("按 user-data-dir 过滤，只清自己启动的实例", () => {
        const cmd = buildKillChromeCommand("C:\\temp\\creator-cdp-abc");
        expect(cmd).toContain("Name = 'chrome.exe'");
        expect(cmd).toContain("-match '");
        expect(cmd).toContain("C:\\\\temp\\\\creator-cdp-abc"); // 反斜杠双写转义
        expect(cmd).toContain("Stop-Process");
    });

    it("不含无差别 kill（按名全杀）", () => {
        const cmd = buildKillChromeCommand("C:\\tmp\\x");
        expect(cmd).not.toContain("Stop-Process -Name");
        expect(cmd).not.toMatch(/Get-Process.*chrome/i);
    });

    it("profileDir 为空串时不产生空匹配段", () => {
        const cmd = buildKillChromeCommand("");
        expect(cmd).toMatch(/-match ''/);
    });
});
