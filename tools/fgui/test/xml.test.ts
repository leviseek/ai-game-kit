import { describe, expect, test } from "bun:test";

import { XmlParseError, decodeEntities, findChild, parseXml } from "../lib/xml";

describe("decodeEntities", () => {
  test("解码命名实体", () => {
    expect(decodeEntities("a&amp;b")).toBe("a&b");
    expect(decodeEntities("&lt;tag&gt;")).toBe("<tag>");
    expect(decodeEntities("&quot;q&quot;")).toBe('"q"');
    expect(decodeEntities("&apos;x&apos;")).toBe("'x'");
  });

  test("解码十进制与十六进制字符引用", () => {
    expect(decodeEntities("&#65;&#x42;")).toBe("AB");
  });

  test("未知实体原样保留", () => {
    expect(decodeEntities("&unknown;")).toBe("&unknown;");
  });
});

describe("parseXml", () => {
  test("解析 package.xml 根元素与属性", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<packageDescription id="4q9x2uij">
  <resources>
    <component id="hz2u0" name="DemoView.xml" path="/" exported="true"/>
  </resources>
  <publish name=""/>
</packageDescription>`;

    const root = parseXml(xml);
    expect(root.name).toBe("packageDescription");
    expect(root.attrs.id).toBe("4q9x2uij");

    const resources = findChild(root, "resources");
    expect(resources).toBeDefined();
    expect(resources?.children.length).toBe(1);
    expect(resources?.children[0]?.attrs).toMatchObject({ id: "hz2u0", name: "DemoView.xml" });
  });

  test("解析组件 XML 的嵌套 displayList 与自闭合", () => {
    const xml = `<component size="85,25" extention="Button">
  <controller name="button" pages="0,up,1,down"/>
  <displayList>
    <image id="n5_f37u" name="n5" src="phl68y" xy="0,0" size="85,25">
      <gearDisplay controller="button" pages="0,2"/>
      <relation target="" sidePair="width-width,height-height"/>
    </image>
    <text id="n4" name="title" text="确定"/>
  </displayList>
  <Button/>
</component>`;

    const root = parseXml(xml);
    const displayList = findChild(root, "displayList");
    expect(displayList).toBeDefined();
    const image = displayList?.children.find((child) => child.name === "image");
    expect(image?.attrs).toMatchObject({ id: "n5_f37u", src: "phl68y", size: "85,25" });
    expect(image?.children.length).toBe(2);
    expect(image?.children[0]?.name).toBe("gearDisplay");
    expect(image?.children[1]?.attrs.sidePair).toBe("width-width,height-height");
  });

  test("属性值解码实体（tooltips 中的 &#xD;）", () => {
    const xml = `<component size="10,10"><displayList><image id="n1" tooltips="行1&#xD;行2"/></displayList></component>`;
    const root = parseXml(xml);
    const image = findChild(root, "displayList")?.children[0];
    expect(image?.attrs.tooltips).toBe("行1\r行2");
  });

  test("处理 XML 声明与注释", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<!-- 注释 -->
<component size="1,1"/>`;
    const root = parseXml(xml);
    expect(root.name).toBe("component");
  });

  test("根元素后残留内容报错", () => {
    expect(() => parseXml(`<a/>bogus`)).toThrow(XmlParseError);
  });

  test("元素内意外文本报错", () => {
    expect(() => parseXml(`<a>text</a>`)).toThrow(XmlParseError);
  });

  test("结束标签不匹配报错", () => {
    expect(() => parseXml(`<a><b/></c>`)).toThrow(XmlParseError);
  });

  test("未闭合元素报错", () => {
    expect(() => parseXml(`<a><b/></a>`)).not.toThrow();
    expect(() => parseXml(`<a><b>`)).toThrow(XmlParseError);
  });
});
