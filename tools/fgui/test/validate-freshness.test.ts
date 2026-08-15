import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkConstantFreshness, checkTypeFreshness } from "../commands/validate";
import { generateConstants } from "../commands/gen-constants";
import { generateTypeFiles } from "../commands/gen-types";
import type { FguiProject } from "../lib/fgui";

function setupProject(): { dir: string; project: FguiProject } {
    const dir = mkdtempSync(join(tmpdir(), "fgui-freshness-"));
    writeFileSync(join(dir, "demo.fairy"), `<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="t" type="CocosCreator" version="5.0"/>`);
    const pkgDir = join(dir, "assets", "Demo");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
        join(pkgDir, "package.xml"),
        `<?xml version="1.0" encoding="utf-8"?>\n<packageDescription id="4q9x2uij"><resources><component id="03gta" name="LoginView.xml" path="/" exported="true"/></resources></packageDescription>`,
    );
    writeFileSync(
        join(pkgDir, "LoginView.xml"),
        `
<component size="1280,720">
  <displayList>
    <text id="t0" name="txt_title" xy="0,0" size="200,40" fontSize="24" text="标题"/>
    <component id="b0" name="btn_login" src="c000" fileName="CommonButton.xml" pkg="cmn00001" xy="0,0" size="120,48"><Button title="登录"/></component>
  </displayList>
</component>`.trim(),
    );
    return { dir, project: { root: dir, projectDir: dir, name: "demo", assetsDir: join(dir, "assets") } };
}

/** 把生成的产物写入磁盘（模拟运行 gen-types）。 */
function writeGeneratedFiles(project: FguiProject): void {
    for (const f of generateTypeFiles(project)) {
        mkdirSync(join(project.root, "assets", "ui", "generated"), { recursive: true });
        writeFileSync(f.file, `${f.lines.join("\n")}\n`, "utf8");
    }
}

describe("checkTypeFreshness", () => {
    test("产物与源 XML 一致时通过", () => {
        const { dir, project } = setupProject();
        try {
            writeGeneratedFiles(project);
            const issues = checkTypeFreshness(project);
            expect(issues.filter((i) => i.severity === "error")).toEqual([]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("源 XML 字段改名后未重跑 gen-types 则失败", () => {
        const { dir, project } = setupProject();
        try {
            writeGeneratedFiles(project);
            // 修改源 XML：txt_title 改名 txt_title2
            const xml = join(dir, "assets", "Demo", "LoginView.xml");
            writeFileSync(xml, readFileText(xml).replace('name="txt_title"', 'name="txt_title2"'));
            const issues = checkTypeFreshness(project);
            const errors = issues.filter((i) => i.severity === "error");
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]!.message).toContain("gen-types 产物过期");
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("源 XML 新增元件后未重跑 gen-types 则失败", () => {
        const { dir, project } = setupProject();
        try {
            writeGeneratedFiles(project);
            const xml = join(dir, "assets", "Demo", "LoginView.xml");
            writeFileSync(xml, readFileText(xml).replace("</displayList>", '<text id="t1" name="txt_new" xy="0,0" size="100,20" text="新"/>\n  </displayList>'));
            const issues = checkTypeFreshness(project);
            expect(issues.some((i) => i.severity === "error" && i.message.includes("过期"))).toBe(true);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("kind 变化（component → button）后未重跑则失败", () => {
        const { dir, project } = setupProject();
        try {
            writeGeneratedFiles(project);
            const xml = join(dir, "assets", "Demo", "LoginView.xml");
            // 给 txt_title 加 Button 扩展子节点 → kind 从 text 变 button
            writeFileSync(xml, readFileText(xml).replace('<text id="t0" name="txt_title"', '<component id="t0" name="txt_title"'));
            const issues = checkTypeFreshness(project);
            expect(issues.some((i) => i.severity === "error" && i.message.includes("过期"))).toBe(true);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("产物缺失时失败并提示先运行 gen-types", () => {
        const { dir, project } = setupProject();
        try {
            const issues = checkTypeFreshness(project);
            const errors = issues.filter((i) => i.severity === "error");
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]!.message).toContain("gen-types 产物缺失");
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("磁盘存在多余 -types 产物时失败", () => {
        const { dir, project } = setupProject();
        try {
            writeGeneratedFiles(project);
            const genDir = join(dir, "assets", "ui", "generated");
            writeFileSync(join(genDir, "ui-ghost-types.ts"), "// stale\n");
            const issues = checkTypeFreshness(project);
            expect(issues.some((i) => i.severity === "error" && i.message.includes("多余"))).toBe(true);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("重复运行 gen-types 后产物一致且 freshness 通过（幂等）", () => {
        const { dir, project } = setupProject();
        try {
            writeGeneratedFiles(project);
            const before = readFileText(join(dir, "assets", "ui", "generated", "ui-demo-types.ts"));
            writeGeneratedFiles(project);
            const after = readFileText(join(dir, "assets", "ui", "generated", "ui-demo-types.ts"));
            expect(after).toBe(before);
            expect(existsSync(join(dir, "assets", "ui", "generated", "ui-demo-types.ts"))).toBe(true);
            expect(checkTypeFreshness(project).filter((i) => i.severity === "error")).toEqual([]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

function readFileText(path: string): string {
    return readFileSync(path, "utf8");
}

/** 把 gen-constants 产物写入磁盘（模拟运行 gen-constants）。 */
function writeConstantFiles(project: FguiProject): void {
    for (const f of generateConstants(project)) {
        mkdirSync(join(project.root, "assets", "ui", "generated"), { recursive: true });
        writeFileSync(f.file, `${f.lines.join("\n")}\n`, "utf8");
    }
}

describe("checkConstantFreshness（P1-7 gen-constants freshness）", () => {
    test("常量产物与源 XML 一致时通过", () => {
        const { dir, project } = setupProject();
        try {
            writeConstantFiles(project);
            const issues = checkConstantFreshness(project);
            expect(issues.filter((i) => i.severity === "error")).toEqual([]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("exported 组件增删后未重跑 gen-constants 则失败", () => {
        const { dir, project } = setupProject();
        try {
            writeConstantFiles(project);
            // 修改 package.xml：新增一个 exported 组件（不重跑 gen-constants）
            const pkgXml = join(dir, "assets", "Demo", "package.xml");
            writeFileSync(pkgXml, readFileText(pkgXml).replace('<component id="03gta" name="LoginView.xml"', '<component id="03gtb" name="SettingsView.xml"'));
            writeFileSync(join(dir, "assets", "Demo", "SettingsView.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<component size="100,100"><displayList/></component>`);
            const issues = checkConstantFreshness(project);
            expect(issues.some((i) => i.severity === "error" && i.message.includes("gen-constants 产物过期"))).toBe(true);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("常量产物缺失时失败并提示先运行 gen-constants", () => {
        const { dir, project } = setupProject();
        try {
            const issues = checkConstantFreshness(project);
            expect(issues.some((i) => i.severity === "error" && i.message.includes("gen-constants 产物缺失"))).toBe(true);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("磁盘存在多余常量产物时失败", () => {
        const { dir, project } = setupProject();
        try {
            writeConstantFiles(project);
            writeFileSync(join(dir, "assets", "ui", "generated", "ui-ghost.ts"), "// stale\n");
            const issues = checkConstantFreshness(project);
            expect(issues.some((i) => i.severity === "error" && i.message.includes("多余"))).toBe(true);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
