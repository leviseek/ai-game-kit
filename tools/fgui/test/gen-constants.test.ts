import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateConstants } from "../commands/gen-constants";
import { locateProject } from "../lib/fgui";

function setupProject(): { dir: string } {
    const dir = mkdtempSync(join(tmpdir(), "fgui-gen-"));
    writeFileSync(join(dir, "demo.fairy"), `<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="t" type="CocosCreator" version="5.0"/>`);
    const setupPkg = (pkgName: string, pkgId: string, comps: Array<[string, string, boolean]>) => {
        const pkgDir = join(dir, "assets", pkgName);
        mkdirSync(pkgDir, { recursive: true });
        const resources = comps.map(([id, name, exported]) =>
            `<component id="${id}" name="${name}" path="/" exported="${exported}"/>`).join("");
        writeFileSync(join(pkgDir, "package.xml"),
            `<?xml version="1.0" encoding="utf-8"?>\n<packageDescription id="${pkgId}"><resources>${resources}<image id="bg00" name="bg.png" path="/img/"/></resources></packageDescription>`);
        for (const [, name] of comps) {
            writeFileSync(join(pkgDir, name), `<component size="1,1"><displayList/></component>`);
        }
        mkdirSync(join(pkgDir, "img"), { recursive: true });
        writeFileSync(join(pkgDir, "img", "bg.png"), "x");
    };
    setupPkg("Demo", "4q9x2uij", [["03gta", "LobbyView.xml", true], ["29kie", "SettingsPanel2.xml", true], ["hid00", "Hidden.xml", false]]);
    setupPkg("Common", "cmn00001", [["com03", "UnitSlot.xml", true]]);
    return { dir };
}

describe("generateConstants", () => {
    test("仅 exported 组件生成常量，命名 Ui<包名><资源名>，含跨包", () => {
        const { dir } = setupProject();
        try {
            const project = locateProject(dir);
            const out = generateConstants(project);
            const demo = out.find((o) => o.pkg === "Demo");
            const common = out.find((o) => o.pkg === "Common");
            expect(demo).toBeDefined();
            expect(common).toBeDefined();
            expect(demo!.lines).toContain('export const UiDemoLobbyView = "ui://4q9x2uij03gta";');
            expect(demo!.lines).toContain('export const UiDemoSettingsPanel2 = "ui://4q9x2uij29kie";');
            expect(common!.lines).toContain('export const UiCommonUnitSlot = "ui://cmn00001com03";');
            expect(demo!.lines.some((l) => l.includes("Hidden"))).toBe(false);
            expect(demo!.lines.some((l) => l.includes("bg"))).toBe(false);
            expect(out.length).toBe(2);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("确定性：同工程两次生成输出一致", () => {
        const { dir } = setupProject();
        try {
            const project = locateProject(dir);
            const a = generateConstants(project);
            const b = generateConstants(project);
            expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
