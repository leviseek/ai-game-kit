import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    findExportedComponentNameConflicts,
    findResourceIdConflicts,
    locateProject,
    nextResourceId,
    readComponent,
    readPackage,
    validateComponent,
    validateComponentSemantics,
    validatePackageFileIntegrity,
    validatePackageManifest,
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
        const comp = pkg.resources.find((r) => r.kind === "component" && r.name === "DemoView.xml");
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

describe("findExportedComponentNameConflicts", () => {
    function setupPkg(dir: string, pkgName: string, id: string, compName: string, exported: boolean): void {
        const pkgDir = join(dir, "assets", pkgName);
        mkdirSync(pkgDir, { recursive: true });
        writeFileSync(
            join(pkgDir, "package.xml"),
            `<?xml version="1.0" encoding="utf-8"?>
<packageDescription id="${id}">
  <resources>
    <component id="aa11" name="${compName}.xml" path="/" exported="${exported}"/>
  </resources>
</packageDescription>`,
        );
        writeFileSync(
            join(pkgDir, `${compName}.xml`),
            `<?xml version="1.0" encoding="utf-8"?>
<component size="200,100">
  <displayList>
    <text id="n1" name="title" text="页面"/>
  </displayList>
</component>`,
        );
    }

    test("跨包同名导出组件返回冲突清单", () => {
        const dir = mkdtempSync(join(tmpdir(), "fgui-"));
        try {
            writeFileSync(join(dir, "demo.fairy"), `<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="t" type="CocosCreator" version="5.0"/>`);
            setupPkg(dir, "CardGame", "pkgcard1", "BattleView", true);
            setupPkg(dir, "AutoBattle", "pkgauto1", "BattleView", true);
            const project = locateProject(dir);
            const conflicts = findExportedComponentNameConflicts(project);
            expect(Array.from(conflicts.keys())).toEqual(["BattleView"]);
            expect(conflicts.get("BattleView")?.sort()).toEqual(["AutoBattle", "CardGame"]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("不同名导出组件无冲突", () => {
        const dir = mkdtempSync(join(tmpdir(), "fgui-"));
        try {
            writeFileSync(join(dir, "demo.fairy"), `<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="t" type="CocosCreator" version="5.0"/>`);
            setupPkg(dir, "CardGame", "pkgcard1", "CardBattleView", true);
            setupPkg(dir, "AutoBattle", "pkgauto1", "AutoBattleView", true);
            const project = locateProject(dir);
            expect(findExportedComponentNameConflicts(project).size).toBe(0);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("非导出组件不参与查重", () => {
        const dir = mkdtempSync(join(tmpdir(), "fgui-"));
        try {
            writeFileSync(join(dir, "demo.fairy"), `<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="t" type="CocosCreator" version="5.0"/>`);
            setupPkg(dir, "CardGame", "pkgcard1", "BattleView", false);
            setupPkg(dir, "AutoBattle", "pkgauto1", "BattleView", false);
            const project = locateProject(dir);
            expect(findExportedComponentNameConflicts(project).size).toBe(0);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
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

describe("validateComponentSemantics", () => {
    function setupFixture(componentXml: string): { pkg: ReturnType<typeof readPackage>; comp: ReturnType<typeof readComponent>; project: ReturnType<typeof locateProject> } {
        const dir = mkdtempSync(join(tmpdir(), "fgui-sem-"));
        try {
            writeFileSync(join(dir, "demo.fairy"), `<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="t" type="CocosCreator" version="5.0"/>`);
            const pkgDir = join(dir, "assets", "Demo");
            mkdirSync(pkgDir, { recursive: true });
            writeFileSync(join(pkgDir, "package.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<packageDescription id="testid"><resources><component id="aa11" name="A.xml" path="/" exported="true"/><image id="bb22" name="bg.png" path="/img/"/></resources></packageDescription>`);
            writeFileSync(join(pkgDir, "A.xml"), componentXml);
            const project = locateProject(dir);
            return { project, pkg: readPackage(project, "Demo"), comp: readComponent(project, "Demo", "A.xml") };
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    test("合法 Slider：controller + bar/grip + <Slider/> 通过", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="200,20" extention="Slider">
  <displayList>
    <image id="n1" name="bg" src="bb22"/>
    <image id="n2" name="bar" src="bb22"/>
    <component id="n3" name="grip" src="aa11" fileName="A.xml"/>
  </displayList>
  <Slider/>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error");
        expect(errors).toEqual([]);
    });

    test("Slider 缺 bar/grip 或扩展节点报 error", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="200,20" extention="Slider">
  <displayList>
    <image id="n1" name="bg" src="bb22"/>
  </displayList>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error").map((i) => i.message);
        expect(errors.some((m) => m.includes("bar"))).toBe(true);
        expect(errors.some((m) => m.includes("grip"))).toBe(true);
        expect(errors.some((m) => m.includes("<Slider/>"))).toBe(true);
    });

    test("ProgressBar 缺 bar 报 error", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="200,20" extention="ProgressBar">
  <displayList>
    <image id="n1" name="bg" src="bb22"/>
  </displayList>
  <ProgressBar/>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error");
        expect(errors.some((i) => i.message.includes("bar"))).toBe(true);
    });

    test("ComboBox 缺 dropdown 扩展节点报 error", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="100,20" extention="ComboBox">
  <displayList>
    <text id="n1" name="title"/>
  </displayList>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error");
        expect(errors.some((i) => i.message.includes("dropdown"))).toBe(true);
    });

    test("controller pages 非完整 pageId,pageName 对报 error", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="10,10">
  <controller name="c1" pages="0,up,1" selected="0"/>
  <displayList/>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error");
        expect(errors.some((i) => i.message.includes("pages"))).toBe(true);
    });

    test("gear 引用不存在的 controller 报 error", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="10,10">
  <controller name="c1" pages="0,,1," selected="0"/>
  <displayList>
    <image id="n1" name="img" src="bb22">
      <gearDisplay controller="ghost" pages="0"/>
    </image>
  </displayList>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error");
        expect(errors.some((i) => i.message.includes("ghost"))).toBe(true);
    });

    test("gear pages 值不在 controller 页内报 error", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="10,10">
  <controller name="c1" pages="0,,1," selected="0"/>
  <displayList>
    <image id="n1" name="img" src="bb22">
      <gearDisplay controller="c1" pages="0,9"/>
    </image>
  </displayList>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error");
        expect(errors.some((i) => i.message.includes("9"))).toBe(true);
    });

    test("gearColor values 数量与 pages 数量不一致报 error", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="10,10">
  <controller name="c1" pages="0,,1," selected="0"/>
  <displayList>
    <text id="n1" name="t" text="x">
      <gearColor controller="c1" pages="0,1" values="#fff"/>
    </text>
  </displayList>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error");
        expect(errors.some((i) => i.message.includes("values"))).toBe(true);
    });

    test("禁止 <graph>：出现即报 error", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="10,10">
  <displayList>
    <graph id="n1" name="g" type="rect" fillColor="#fff"/>
  </displayList>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error");
        expect(errors.some((i) => i.message.includes("<graph>"))).toBe(true);
    });

    test("list defaultItem 引用未登记组件报 error", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="200,300">
  <displayList>
    <list id="n1" name="list" defaultItem="ui://testidzzzz" overflow="scroll" selectionMode="single"/>
  </displayList>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error");
        expect(errors.some((i) => i.message.includes("defaultItem"))).toBe(true);
    });

    test("list defaultItem 指向本包已登记组件通过", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="200,300">
  <displayList>
    <list id="n1" name="list" defaultItem="aa11" overflow="scroll" selectionMode="single"/>
  </displayList>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error");
        expect(errors.filter((i) => i.message.includes("defaultItem"))).toEqual([]);
    });

    test("合法 relation sidePair 通过", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="200,200">
  <displayList>
    <image id="n1" name="bg" src="bb22">
      <relation target="" sidePair="width-width,height-height"/>
    </image>
  </displayList>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error");
        expect(errors.filter((i) => i.message.includes("sidePair"))).toEqual([]);
    });

    test("relation 同时声明三个 sidePair 报 error", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="200,200">
  <displayList>
    <image id="n1" name="title" src="bb22">
      <relation target="" sidePair="center-center,top-top,width-width"/>
    </image>
  </displayList>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error");
        expect(errors.some((i) => i.message.includes("最多允许 2 项"))).toBe(true);
    });

    test("relation 同时声明两个位置 sidePair 通过", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="200,200">
  <displayList>
    <image id="n1" name="title" src="bb22">
      <relation target="" sidePair="center-center,top-top"/>
    </image>
  </displayList>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error");
        expect(errors.filter((i) => i.message.includes("sidePair"))).toEqual([]);
    });

    test("relation 同时声明尺寸和位置 sidePair 通过", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="200,200">
  <displayList>
    <image id="n1" name="panel" src="bb22">
      <relation target="" sidePair="width-width,bottom-bottom"/>
    </image>
  </displayList>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error");
        expect(errors.filter((i) => i.message.includes("sidePair"))).toEqual([]);
    });

    test("非法 side 名报 error", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="200,200">
  <displayList>
    <image id="n1" name="bg" src="bb22">
      <relation target="" sidePair="width-width,foo-bar"/>
    </image>
  </displayList>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error").map((i) => i.message);
        expect(errors.some((m) => m.includes("foo"))).toBe(true);
    });

    test("relation sidePair 非 target-side 形式报 error", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="200,200">
  <displayList>
    <image id="n1" name="bg" src="bb22">
      <relation target="" sidePair="width"/>
    </image>
  </displayList>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error");
        expect(errors.some((i) => i.message.includes("sidePair"))).toBe(true);
    });

    test("displayList 子元件 name 重复报 error", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="10,10">
  <displayList>
    <image id="n1" name="dup" src="bb22"/>
    <image id="n2" name="dup" src="bb22"/>
  </displayList>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error");
        expect(errors.some((i) => i.message.includes("name 重复"))).toBe(true);
    });

    test("controller 空 page name 报 error", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="10,10">
  <controller name="c1" pages="0,,1," selected="0"/>
  <displayList/>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error");
        expect(errors.some((i) => i.message.includes("空 page"))).toBe(true);
    });

    test("controller 重复 page id 报 error", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="10,10">
  <controller name="c1" pages="0,a,0,b" selected="0"/>
  <displayList/>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error");
        expect(errors.some((i) => i.message.includes("重复 page"))).toBe(true);
    });

    test("controller selected 越界报 error", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="10,10">
  <controller name="c1" pages="0,a,1,b" selected="5"/>
  <displayList/>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error");
        expect(errors.some((i) => i.message.includes("selected"))).toBe(true);
    });

    test("image 误用 loader fill 属性报 error", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="10,10">
  <displayList>
    <image id="n1" name="img" src="bb22" fill="scaleFree"/>
  </displayList>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error");
        expect(errors.some((i) => i.message.includes("fill"))).toBe(true);
    });

    test("fileName 与登记路径不一致报 error", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="10,10">
  <displayList>
    <image id="n1" name="img" src="bb22" fileName="wrong/bg.png"/>
  </displayList>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error");
        expect(errors.some((i) => i.message.includes("fileName"))).toBe(true);
    });

    test("extention=Button 缺少 controller 或扩展节点报 error", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="100,30" extention="Button">
  <displayList>
    <image id="n1" name="bg" src="bb22"/>
  </displayList>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error").map((i) => i.message);
        expect(errors.some((m) => m.includes("button controller") || m.includes("<Button/>"))).toBe(true);
    });

    test("手写 transition 报 error", () => {
        const { project, pkg, comp } = setupFixture(`<?xml version="1.0" encoding="utf-8"?>
<component size="10,10">
  <displayList/>
  <transition name="t1">
    <item time="0" type="XY" target="n1" tween="true" startValue="0,0" endValue="10,10" duration="10"/>
  </transition>
</component>`);
        const errors = validateComponentSemantics(project, pkg, comp).filter((i) => i.severity === "error");
        expect(errors.some((i) => i.message.includes("transition"))).toBe(true);
    });
});

describe("validatePackageFileIntegrity", () => {
    test("临时 fixture：登记的组件与图片文件存在则通过", () => {
        const dir = mkdtempSync(join(tmpdir(), "fgui-int-"));
        try {
            writeFileSync(join(dir, "demo.fairy"), `<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="t" type="CocosCreator" version="5.0"/>`);
            const pkgDir = join(dir, "assets", "Demo");
            const imgDir = join(pkgDir, "img");
            mkdirSync(imgDir, { recursive: true });
            writeFileSync(join(pkgDir, "package.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<packageDescription id="t"><resources><component id="aa11" name="A.xml" path="/" exported="true"/><image id="bb22" name="bg.png" path="/img/"/></resources></packageDescription>`);
            writeFileSync(join(pkgDir, "A.xml"), `<component size="1,1"><displayList/></component>`);
            writeFileSync(join(imgDir, "bg.png"), "fake");

            const project = locateProject(dir);
            const pkg = readPackage(project, "Demo");
            const issues = validatePackageFileIntegrity(project, pkg);
            expect(issues.filter((i) => i.severity === "error")).toEqual([]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("临时 fixture：登记的组件文件缺失时报 error", () => {
        const dir = mkdtempSync(join(tmpdir(), "fgui-int-"));
        try {
            writeFileSync(join(dir, "demo.fairy"), `<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="t" type="CocosCreator" version="5.0"/>`);
            const pkgDir = join(dir, "assets", "Demo");
            mkdirSync(pkgDir, { recursive: true });
            writeFileSync(join(pkgDir, "package.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<packageDescription id="t"><resources><component id="aa11" name="Ghost.xml" path="/" exported="true"/></resources></packageDescription>`);

            const project = locateProject(dir);
            const pkg = readPackage(project, "Demo");
            const issues = validatePackageFileIntegrity(project, pkg);
            const errors = issues.filter((i) => i.severity === "error");
            expect(errors.length).toBe(1);
            expect(errors[0]!.message).toContain("Ghost.xml");
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
        expect(id.length).toBe(5);
    });

    test("带前缀的 id 不与现有冲突", () => {
        const pkg = readPackage(REAL_DEMO, "Demo");
        const id = nextResourceId(pkg, "fmn");
        expect(id.length).toBeGreaterThanOrEqual(5);
        expect(pkg.resources.some((r) => r.id === id)).toBe(false);
    });
});

describe("validatePackageManifest", () => {
    function setupPkg(xml: string, extraFiles: Array<[string, string]> = []) {
        const dir = mkdtempSync(join(tmpdir(), "fgui-mani-"));
        writeFileSync(join(dir, "demo.fairy"), `<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="t" type="CocosCreator" version="5.0"/>`);
        const pkgDir = join(dir, "assets", "Demo");
        mkdirSync(pkgDir, { recursive: true });
        writeFileSync(join(pkgDir, "package.xml"), xml);
        for (const [rel, content] of extraFiles) {
            const full = join(pkgDir, rel);
            mkdirSync(join(full, ".."), { recursive: true });
            writeFileSync(full, content);
        }
        const project = locateProject(dir);
        return { dir, project, pkg: readPackage(project, "Demo") };
    }

    test("package id 非 8 位报 error", () => {
        const { dir, project, pkg } = setupPkg(`<?xml version="1.0" encoding="utf-8"?>\n<packageDescription id="short"><resources/></packageDescription>`);
        try {
            const errors = validatePackageManifest(project, pkg).filter((i) => i.severity === "error");
            expect(errors.some((i) => i.message.includes("8"))).toBe(true);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("资源缺 name 报 error", () => {
        const { dir, project, pkg } = setupPkg(`<?xml version="1.0" encoding="utf-8"?>\n<packageDescription id="12345678"><resources><image id="aa11"/></resources></packageDescription>`);
        try {
            const errors = validatePackageManifest(project, pkg).filter((i) => i.severity === "error");
            expect(errors.some((i) => i.message.includes("name"))).toBe(true);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("资源路径重复注册报 error", () => {
        const { dir, project, pkg } = setupPkg(`<?xml version="1.0" encoding="utf-8"?>\n<packageDescription id="12345678"><resources><image id="aa11" name="bg.png" path="/img/"/><image id="bb22" name="bg.png" path="/img/"/></resources></packageDescription>`, [["img/bg.png", "x"]]);
        try {
            const errors = validatePackageManifest(project, pkg).filter((i) => i.severity === "error");
            expect(errors.some((i) => i.message.includes("重复"))).toBe(true);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("component 指向非 xml 文件报 error", () => {
        const { dir, project, pkg } = setupPkg(`<?xml version="1.0" encoding="utf-8"?>\n<packageDescription id="12345678"><resources><component id="aa11" name="A.png" path="/"/></resources></packageDescription>`, [["A.png", "x"]]);
        try {
            const errors = validatePackageManifest(project, pkg).filter((i) => i.severity === "error");
            expect(errors.some((i) => i.message.includes("xml"))).toBe(true);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("未注册文件扫描报 error", () => {
        const { dir, project, pkg } = setupPkg(`<?xml version="1.0" encoding="utf-8"?>\n<packageDescription id="12345678"><resources/></packageDescription>`, [["img/orphan.png", "x"]]);
        try {
            const errors = validatePackageManifest(project, pkg).filter((i) => i.severity === "error");
            expect(errors.some((i) => i.message.includes("登记"))).toBe(true);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe("nextResourceId 前缀续编", () => {
    test("续编：dm000 已用则返回 dm001", () => {
        const dir = mkdtempSync(join(tmpdir(), "fgui-seq-"));
        try {
            writeFileSync(join(dir, "demo.fairy"), `<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="t" type="CocosCreator" version="5.0"/>`);
            const pkgDir = join(dir, "assets", "Demo");
            mkdirSync(pkgDir, { recursive: true });
            writeFileSync(join(pkgDir, "package.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<packageDescription id="12345678"><resources><component id="dm000" name="A.xml" path="/" exported="true"/><component id="dm001" name="B.xml" path="/" exported="true"/></resources></packageDescription>`);
            writeFileSync(join(pkgDir, "A.xml"), "<component size=\"1,1\"><displayList/></component>");
            writeFileSync(join(pkgDir, "B.xml"), "<component size=\"1,1\"><displayList/></component>");
            const project = locateProject(dir);
            const pkg = readPackage(project, "Demo");
            expect(nextResourceId(pkg, "dm")).toBe("dm002");
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("续编：无前缀时随机 5 位不与现有冲突", () => {
        const dir = mkdtempSync(join(tmpdir(), "fgui-seq-"));
        try {
            writeFileSync(join(dir, "demo.fairy"), `<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="t" type="CocosCreator" version="5.0"/>`);
            const pkgDir = join(dir, "assets", "Demo");
            mkdirSync(join(pkgDir, "img"), { recursive: true });
            writeFileSync(join(pkgDir, "package.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<packageDescription id="12345678"><resources><image id="abc12" name="bg.png" path="/img/"/></resources></packageDescription>`);
            writeFileSync(join(pkgDir, "img", "bg.png"), "x");
            const project = locateProject(dir);
            const pkg = readPackage(project, "Demo");
            const id = nextResourceId(pkg);
            expect(id.length).toBe(5);
            expect(pkg.resources.some((r) => r.id === id)).toBe(false);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
