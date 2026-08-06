import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { locateProject, readPackage } from "../lib/fgui";
import {
  ensureResourceRegistered,
  parseScale9grid,
  registerComponent,
  registerGeneratedImage,
} from "../lib/sprite";

describe("parseScale9grid", () => {
  test("解析四元组", () => {
    expect(parseScale9grid("11,8,192,115")).toEqual({ left: 11, top: 8, right: 192, bottom: 115 });
  });

  test("非法格式报错", () => {
    expect(() => parseScale9grid("1,2,3")).toThrow();
    expect(() => parseScale9grid("a,b,c,d")).toThrow();
  });
});

describe("ensureResourceRegistered / registerGeneratedImage", () => {
  test("normalizePath 补前导斜杠，/img/ 与 img/ 视为同路径（幂等）", () => {
    const dir = mkdtempSync(join(tmpdir(), "fgui-sprite-"));
    try {
      writeFileSync(join(dir, "demo.fairy"), `<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="t" type="CocosCreator" version="5.0"/>`);
      const pkgDir = join(dir, "assets", "Demo");
      mkdirSync(join(pkgDir, "img"), { recursive: true });
      writeFileSync(
        join(pkgDir, "package.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<packageDescription id="4q9x2uij">
  <resources>
    <component id="hz2u0" name="DemoView.xml" path="/" exported="true"/>
    <image id="fmn11" name="background.png" path="/img/" scale="9grid" scale9grid="11,8,192,115" qualityOption="source" duplicatePadding="true"/>
  </resources>
</packageDescription>`,
      );

      const project = locateProject(dir);
      const pkg = readPackage(project, "Demo");
      // 带前导斜杠登记已存在资源 → 幂等，返回原 id
      const id = registerGeneratedImage(pkg, "background.png", "img/", "11,8,192,115");
      expect(id).toBe("fmn11");
      const xml = readFileSync(join(pkgDir, "package.xml"), "utf8");
      expect((xml.match(/name="background\.png"/g) ?? []).length).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("同名资源已登记时返回已存在（幂等）", () => {
    const dir = mkdtempSync(join(tmpdir(), "fgui-sprite-"));
    try {
      writeFileSync(join(dir, "demo.fairy"), `<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="t" type="CocosCreator" version="5.0"/>`);
      const pkgDir = join(dir, "assets", "Demo");
      mkdirSync(join(pkgDir, "img"), { recursive: true });
      writeFileSync(
        join(pkgDir, "package.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<packageDescription id="4q9x2uij">
  <resources>
    <component id="hz2u0" name="DemoView.xml" path="/" exported="true"/>
    <image id="fmn11" name="background.png" path="/img/" scale="9grid" scale9grid="11,8,192,115" qualityOption="source" duplicatePadding="true"/>
  </resources>
</packageDescription>`,
      );

      const project = locateProject(dir);
      const pkg = readPackage(project, "Demo");
      const existing = ensureResourceRegistered(pkg, "background.png", "/img/");
      expect(existing).toBe(true);
      // 文件未变
      const xml = readFileSync(join(pkgDir, "package.xml"), "utf8");
      expect(xml).toContain('scale9grid="11,8,192,115"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("新资源写入登记条目并保留原内容", () => {
    const dir = mkdtempSync(join(tmpdir(), "fgui-sprite-"));
    try {
      writeFileSync(join(dir, "demo.fairy"), `<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="t" type="CocosCreator" version="5.0"/>`);
      const pkgDir = join(dir, "assets", "Demo");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        join(pkgDir, "package.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<packageDescription id="4q9x2uij">
  <resources>
    <component id="hz2u0" name="DemoView.xml" path="/" exported="true"/>
  </resources>
</packageDescription>`,
      );

      const project = locateProject(dir);
      const pkg = readPackage(project, "Demo");
      const id = registerGeneratedImage(pkg, "pixel_btn.png", "/img/", "4,4,8,8");

      const xml = readFileSync(join(pkgDir, "package.xml"), "utf8");
      expect(xml).toContain(`name="pixel_btn.png"`);
      expect(xml).toContain(`scale="9grid"`);
      expect(xml).toContain(`scale9grid="4,4,8,8"`);
      expect(xml).toContain(`id="${id}"`);
      // 原登记保留
      expect(xml).toContain('name="DemoView.xml"');
      // id 不与现有冲突
      expect(id).not.toBe("hz2u0");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("registerComponent 幂等：重复登记返回同一 id 且不重复插入", () => {
    const dir = mkdtempSync(join(tmpdir(), "fgui-sprite-"));
    try {
      writeFileSync(join(dir, "demo.fairy"), `<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="t" type="CocosCreator" version="5.0"/>`);
      const pkgDir = join(dir, "assets", "Demo");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        join(pkgDir, "package.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<packageDescription id="4q9x2uij">
  <resources>
    <component id="hz2u0" name="DemoView.xml" path="/" exported="true"/>
  </resources>
</packageDescription>`,
      );

      const project = locateProject(dir);
      const pkg = readPackage(project, "Demo");
      const id1 = registerComponent(pkg, "StartButton.xml");
      const pkgAfter = readPackage(project, "Demo");
      const id2 = registerComponent(pkgAfter, "StartButton.xml");

      expect(id1).toMatch(/^[a-z0-9]{5}$/);
      expect(id2).toBe(id1);
      const xml = readFileSync(join(pkgDir, "package.xml"), "utf8");
      const count = (xml.match(/name="StartButton\.xml"/g) ?? []).length;
      expect(count).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("registerComponent 支持前缀续编", () => {
    const dir = mkdtempSync(join(tmpdir(), "fgui-sprite-"));
    try {
      writeFileSync(join(dir, "demo.fairy"), `<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="t" type="CocosCreator" version="5.0"/>`);
      const pkgDir = join(dir, "assets", "Demo");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        join(pkgDir, "package.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<packageDescription id="4q9x2uij">
  <resources>
    <component id="hp000" name="A.xml" path="/" exported="true"/>
  </resources>
</packageDescription>`,
      );
      writeFileSync(join(pkgDir, "A.xml"), "<component size=\"1,1\"><displayList/></component>");

      const project = locateProject(dir);
      const pkg = readPackage(project, "Demo");
      const id = registerComponent(pkg, "B.xml", "/component/", "hp");
      expect(id).toBe("hp001");
      const xml = readFileSync(join(pkgDir, "package.xml"), "utf8");
      expect(xml).toContain('id="hp001"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
