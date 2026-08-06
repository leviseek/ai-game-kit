import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  findResourceIdConflicts,
  locateProject,
  nextResourceId,
  readComponent,
  readPackage,
  validateComponent,
} from "../lib/fgui";

const REAL_DEMO = locateProject();

describe("locateProject", () => {
  test("定位默认 ui/demo 工程", () => {
    expect(REAL_DEMO.name).toBe("demo");
    expect(REAL_DEMO.assetsDir).toContain("demo");
  });

  test("不存在的工程目录报错", () => {
    expect(() => locateProject("ui/does-not-exist")).toThrow();
  });
});

describe("readPackage", () => {
  test("解析 Demo 包资源清单", () => {
    const pkg = readPackage(REAL_DEMO, "Demo");
    expect(pkg.id).toBe("4q9x2uij");
    const comp = pkg.resources.find((r) => r.kind === "component");
    expect(comp).toMatchObject({ id: "hz2u0", name: "DemoView.xml", path: "/", exported: true });
    const img = pkg.resources.find((r) => r.id === "fmn11");
    expect(img?.kind).toBe("image");
    expect(img?.scale9grid).toBe("11,8,192,115");
  });

  test("不存在的包报错", () => {
    expect(() => readPackage(REAL_DEMO, "Nope")).toThrow();
  });
});

describe("findResourceIdConflicts", () => {
  test("真实 Demo 包无冲突", () => {
    const pkg = readPackage(REAL_DEMO, "Demo");
    expect(findResourceIdConflicts(pkg)).toEqual([]);
  });
});

describe("readComponent", () => {
  test("读取 DemoView.xml 并建立对象索引", () => {
    const comp = readComponent(REAL_DEMO, "Demo", "DemoView");
    const ids = comp.objects.map((o) => o.id);
    expect(ids).toContain("n1_fmn1");
    expect(ids).toContain("n0_fmn1");
    const bg = comp.objects.find((o) => o.name === "img_bg");
    expect(bg?.src).toBe("fmn11");
    expect(bg?.size).toBe("1280,720");
  });

  test("组件不存在报错", () => {
    expect(() => readComponent(REAL_DEMO, "Demo", "Missing")).toThrow();
  });

  test("子目录组件可定位（path=/inspectors/ 场景）", () => {
    const dir = mkdtempSync(join(tmpdir(), "fgui-"));
    try {
      writeFileSync(join(dir, "demo.fairy"), `<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="t" type="CocosCreator" version="5.0"/>`);
      const pkgDir = join(dir, "assets", "Demo");
      const inspectorsDir = join(pkgDir, "inspectors");
      mkdirSync(inspectorsDir, { recursive: true });
      writeFileSync(
        join(pkgDir, "package.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<packageDescription id="testid">
  <resources>
    <component id="aa11" name="BasicPropsPanel.xml" path="/inspectors/" exported="true"/>
  </resources>
</packageDescription>`,
      );
      writeFileSync(
        join(inspectorsDir, "BasicPropsPanel.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<component size="200,100">
  <displayList>
    <text id="n1" name="title" text="面板"/>
  </displayList>
</component>`,
      );
      const project = locateProject(dir);
      const comp = readComponent(project, "Demo", "BasicPropsPanel");
      expect(comp.objects.map((o) => o.id)).toContain("n1");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("validateComponent", () => {
  test("DemoView 引用完整，无 error", () => {
    const pkg = readPackage(REAL_DEMO, "Demo");
    const comp = readComponent(REAL_DEMO, "Demo", "DemoView");
    const issues = validateComponent(REAL_DEMO, pkg, comp);
    const errors = issues.filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
  });

  test("临时 fixture：坏引用能报错", () => {
      const dir = mkdtempSync(join(tmpdir(), "fgui-"));
      try {
        writeFileSync(join(dir, "demo.fairy"), `<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="t" type="CocosCreator" version="5.0"/>`);
        const pkgDir = join(dir, "assets", "Demo");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        join(pkgDir, "package.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<packageDescription id="testid">
  <resources>
    <component id="aa11" name="A.xml" path="/" exported="true"/>
    <image id="bb22" name="bg.png" path="/img/"/>
  </resources>
</packageDescription>`,
      );
      writeFileSync(
        join(pkgDir, "A.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<component size="100,100">
  <displayList>
    <image id="n1" name="ok" src="bb22"/>
    <image id="n1" name="dup" src="nope"/>
    <graph id="n2" name="g"/>
    <component id="n3" name="n3" src="missing" fileName="Missing.xml" pkg="otherpkg"/>
  </displayList>
</component>`,
      );
      const project = locateProject(dir);
      const pkg = readPackage(project, "Demo");
      const comp = readComponent(project, "Demo", "A.xml");
      const issues = validateComponent(project, pkg, comp);
      const errors = issues.filter((i) => i.severity === "error").map((i) => i.message);

      expect(errors.some((m) => m.includes('id 重复: "n1"'))).toBe(true);
      expect(errors.some((m) => m.includes('src="nope"'))).toBe(true);
      // 跨包引用不报 error（仅 warning）
      expect(errors.some((m) => m.includes("missing"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("nextResourceId", () => {
  test("生成 id 不与现有资源冲突", () => {
    const pkg = readPackage(REAL_DEMO, "Demo");
    const existing = new Set(pkg.resources.map((r) => r.id));
    const id = nextResourceId(pkg);
    expect(existing.has(id)).toBe(false);
    expect(id.length).toBe(4);
  });

  test("带前缀的 id 不与现有冲突", () => {
    const pkg = readPackage(REAL_DEMO, "Demo");
    const id = nextResourceId(pkg, "fmn");
    expect(id.length).toBeGreaterThanOrEqual(3);
    expect(pkg.resources.some((r) => r.id === id)).toBe(false);
  });
});
