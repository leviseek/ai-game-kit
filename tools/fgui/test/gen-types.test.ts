import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { elementKindOf, generateTypeFiles } from "../commands/gen-types";
import type { FguiProject } from "../lib/fgui";

function setupProject(): { dir: string; project: FguiProject } {
    const dir = mkdtempSync(join(tmpdir(), "fgui-gen-types-"));
    writeFileSync(join(dir, "demo.fairy"), `<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="t" type="CocosCreator" version="5.0"/>`);

    const setupPkg = (pkgName: string, pkgId: string, comps: Array<{ id: string; name: string; exported: boolean; xml: string }>) => {
        const pkgDir = join(dir, "assets", pkgName);
        mkdirSync(pkgDir, { recursive: true });
        const resources = comps.map((c) => `<component id="${c.id}" name="${c.name}" path="/" exported="${c.exported}"/>`).join("");
        writeFileSync(join(pkgDir, "package.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<packageDescription id="${pkgId}"><resources>${resources}</resources></packageDescription>`);
        for (const c of comps) {
            writeFileSync(join(pkgDir, c.name), c.xml);
        }
    };

    // LoginView：文本/按钮/进度条/输入框/组件/图片/无 name 元件
    setupPkg("Demo", "4q9x2uij", [
        {
            id: "03gta",
            name: "LoginView.xml",
            exported: true,
            xml: `
<component size="1280,720">
  <displayList>
    <image id="bg0" name="img_bg" src="m4n3a" fileName="img/bg.png" xy="0,0" size="1280,720"/>
    <text id="t0" name="txt_title" xy="0,0" size="200,40" fontSize="24" text="标题"/>
    <component id="b0" name="btn_login" src="c000" fileName="CommonButton.xml" pkg="cmn00001" xy="0,0" size="120,48"><Button title="登录"/></component>
    <component id="p0" name="bar_progress" src="p000" fileName="CommonProgressBar.xml" pkg="cmn00001" xy="0,0" size="200,20"><ProgressBar value="0" max="100"/></component>
    <text id="i0" name="input_account" input="true" xy="0,0" size="200,36"/>
    <component id="c0" name="panel_root" src="c001" fileName="Panel.xml" pkg="cmn00001" xy="0,0" size="200,200"/>
    <list id="l0" name="list_players" xy="0,0" size="200,90"/>
    <movieclip id="m0" name="mc_fx" xy="0,0" size="32,32"/>
    <component id="nn0" xy="0,0" size="1,1"/>
    <graph id="g0" name="graph_bad" xy="0,0" size="1,1"/>
  </displayList>
</component>`.trim(),
        },
        {
            id: "29kie",
            name: "SettingsPanel2.xml",
            exported: true,
            xml: `
<component size="1280,720">
  <displayList>
    <text id="n0" name="title" xy="0,0" size="200,40" fontSize="24" text="设置"/>
    <component id="n1" name="sld_music" src="s000" fileName="SettingsSlider2.xml" xy="0,0" size="200,24"><Slider value="50" max="100"/></component>
  </displayList>
</component>`.trim(),
        },
        {
            id: "hid00",
            name: "Hidden.xml",
            exported: false,
            xml: `
<component size="100,100"><displayList><text id="h0" name="txt_hidden" xy="0,0" size="10,10" text="x"/></displayList></component>`.trim(),
        },
    ]);

    // Common：跨包共享按钮/进度条组件（供 src 引用，不参与 Demo 类型生成）
    const commonDir = join(dir, "assets", "Common");
    mkdirSync(commonDir, { recursive: true });
    writeFileSync(
        join(commonDir, "package.xml"),
        `<?xml version="1.0" encoding="utf-8"?>\n<packageDescription id="cmn00001"><resources><component id="c000" name="CommonButton.xml" path="/" exported="true"/></resources></packageDescription>`,
    );
    writeFileSync(join(commonDir, "CommonButton.xml"), `<component size="240,112" extention="Button"><displayList/></component>`);

    return { dir, project: { root: dir, projectDir: dir, name: "demo", assetsDir: join(dir, "assets") } };
}

describe("generateTypeFiles", () => {
    test("生成三类产物：字段描述 const、派生节点名联合、I 前缀 declaration merging interface", () => {
        const { dir, project } = setupProject();
        try {
            const out = generateTypeFiles(project);
            expect(out.length).toBe(1);
            const demo = out[0]!;
            expect(demo.pkg).toBe("Demo");

            const text = demo.lines.join("\n");
            expect(text).toContain("export const LoginViewFields = {");
            expect(text).toContain('    txt_title: "text",');
            expect(text).toContain('    btn_login: "button",');
            expect(text).toContain('    bar_progress: "progress",');
            expect(text).toContain('    input_account: "input",');
            expect(text).toContain('    panel_root: "component",');
            expect(text).toContain('    list_players: "list",');
            expect(text).toContain('    mc_fx: "movieclip",');
            // Nodes 从 Fields 派生（不重复承载元件名集合）
            expect(text).toContain("export type LoginViewNodes = keyof typeof LoginViewFields;");
            expect(text).not.toContain('"img_bg" | "txt_title"');
            // declaration merging interface 加 I 前缀（区分生成形状与业务类）
            expect(text).toContain("export interface ILoginView {");
            expect(text).toContain("    readonly _txt_title: ITypedTextNode;");
            expect(text).toContain("    readonly _btn_login: ITypedButtonNode;");
            expect(text).toContain("    readonly _bar_progress: ITypedProgressNode;");
            expect(text).toContain("    readonly _input_account: ITypedInputNode;");
            expect(text).toContain("    readonly _mc_fx: ITypedComponentNode;");
            expect(text).toContain("import type {");
            expect(text).toContain("    ITypedButtonNode,");
            expect(text).toContain("    ITypedTextNode,");
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("跳过无 name 元件、graph 与未 exported 组件", () => {
        const { dir, project } = setupProject();
        try {
            const out = generateTypeFiles(project);
            const text = out[0]!.lines.join("\n");
            expect(text).not.toContain("graph_bad");
            expect(text).not.toContain("Hidden");
            expect(text).not.toContain("nn0");
            // 无 name 的元件不进入节点联合
            expect(text).not.toContain('""');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("确定性：同工程两次生成输出一致", () => {
        const { dir, project } = setupProject();
        try {
            const a = generateTypeFiles(project);
            const b = generateTypeFiles(project);
            expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("多组件各生成独立的 Nodes/Fields/interface 段", () => {
        const { dir, project } = setupProject();
        try {
            const out = generateTypeFiles(project);
            const text = out[0]!.lines.join("\n");
            expect(text).toContain("export type SettingsPanel2Nodes = keyof typeof SettingsPanel2Fields;");
            expect(text).toContain('    sld_music: "component",');
            expect(text).toContain("export interface ISettingsPanel2 {");
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe("elementKindOf", () => {
    test("按钮/进度条/滑动条扩展映射", () => {
        expect(elementKindOf({ name: "btn", nodeName: "component", extension: "Button" })).toBe("button");
        expect(elementKindOf({ name: "bar", nodeName: "component", extension: "ProgressBar" })).toBe("progress");
        // Slider/ComboBox 无独立 kind，回落 component
        expect(elementKindOf({ name: "sld", nodeName: "component", extension: "Slider" })).toBe("component");
        expect(elementKindOf({ name: "cbx", nodeName: "component", extension: "ComboBox" })).toBe("component");
    });

    test("文本/输入框/列表/图片/影片剪辑", () => {
        expect(elementKindOf({ name: "t", nodeName: "text" })).toBe("text");
        expect(elementKindOf({ name: "in", nodeName: "text", isInput: true })).toBe("input");
        expect(elementKindOf({ name: "l", nodeName: "list" })).toBe("list");
        expect(elementKindOf({ name: "img", nodeName: "image" })).toBe("image");
        expect(elementKindOf({ name: "mc", nodeName: "movieclip" })).toBe("movieclip");
        expect(elementKindOf({ name: "ld", nodeName: "loader" })).toBe("component");
    });

    test("graph 等未知节点不生成 kind", () => {
        expect(elementKindOf({ name: "g", nodeName: "graph" })).toBeUndefined();
    });
});
