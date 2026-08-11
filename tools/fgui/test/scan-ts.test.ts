import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FguiProject } from "../lib/fgui";
import { scanTsRawUrls } from "../lib/scan-ts";

/** 构造临时工程：Common 包含 com03 组件，samples/usage.ts 含裸 URL，generated 含生成常量。 */
function setupProject(): { dir: string; project: FguiProject } {
    const dir = mkdtempSync(join(tmpdir(), "fgui-scan-"));
    writeFileSync(join(dir, "demo.fairy"), `<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="t" type="CocosCreator" version="5.0"/>`);
    const commonDir = join(dir, "assets", "Common");
    mkdirSync(commonDir, { recursive: true });
    writeFileSync(join(commonDir, "package.xml"),
        `<?xml version="1.0" encoding="utf-8"?>\n<packageDescription id="cmn00001"><resources><component id="com03" name="UnitSlot.xml" path="/" exported="true"/></resources></packageDescription>`);
    writeFileSync(join(commonDir, "UnitSlot.xml"), `<component size="1,1"><displayList/></component>`);
    const genDir = join(dir, "assets", "ui", "generated");
    mkdirSync(genDir, { recursive: true });
    writeFileSync(join(genDir, "ui-common.ts"),
        `// 由 \`bun run fgui gen-constants\` 生成\n` +
        `export const UiCommonUnitSlot = "ui://cmn00001com03";\n`);
    const srcDir = join(dir, "assets", "samples");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "usage.ts"),
        `const a = "ui://cmn00001com03";\n` +
        `const b = "ui://cmn00001zzz99";\n` +
        `// 注释里的 ui://cmn00001com03 不扫\n`);
    return { dir, project: { root: dir, projectDir: dir, name: "demo", assetsDir: join(dir, "assets") } };
}

describe("scanTsRawUrls", () => {
    test("匹配生成常量报 warning，未登记报 error，注释忽略", () => {
        const { dir, project } = setupProject();
        try {
            const issues = scanTsRawUrls(project);
            const srcIssues = issues.filter((i) => i.file.endsWith("usage.ts"));
            expect(srcIssues.length).toBe(2);
            expect(srcIssues.filter((i) => i.severity === "warning").length).toBe(1);
            expect(srcIssues.filter((i) => i.severity === "error").length).toBe(1);
            expect(srcIssues.some((i) => i.severity === "error" && i.message.includes("zzz99"))).toBe(true);
            expect(srcIssues.some((i) => i.line === 3)).toBe(false);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("生成文件自身不报问题", () => {
        const { dir, project } = setupProject();
        try {
            const issues = scanTsRawUrls(project);
            expect(issues.some((i) => i.file.includes("ui-common.ts"))).toBe(false);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
