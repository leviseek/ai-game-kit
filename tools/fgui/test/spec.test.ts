import { describe, expect, it } from "bun:test";
import { FONT_SIZE_TIERS, NAME_PREFIXES, nearestFontSizeTier, validateSpec } from "../lib/spec";

/** 合法基线 spec（含交互按钮的完整决策）。 */
function baseSpec(): Record<string, unknown> {
    return {
        canvas: { width: 1280, height: 720 },
        package: "Demo",
        objects: [
            { name: "bg_panel", type: "image", src: "bg000", xy: [0, 0], size: [1280, 720] },
            {
                name: "btn_start",
                type: "button",
                interactive: true,
                componentType: "Button",
                rationale: "可点击、需按压/悬停反馈",
                xy: [540, 500],
                size: [200, 80],
                relations: [{ target: "", sidePair: ["center-center", "bottom-bottom"] }],
            },
            { name: "txt_title", type: "text", fontSize: 32, xy: [100, 100], size: [200, 40] },
        ],
        pending: ["字体观感需人工确认"],
    };
}

describe("validateSpec 基线", () => {
    it("合法 spec 无问题", () => {
        expect(validateSpec(baseSpec())).toHaveLength(0);
    });

    it("顶层非对象报 not-object", () => {
        const issues = validateSpec("nope");
        expect(issues.some((i) => i.code === "not-object" && i.severity === "error")).toBe(true);
    });
});

describe("字号档位", () => {
    it("非档位字号报 error 并提示最近档位", () => {
        const spec = baseSpec();
        (spec.objects[2] as Record<string, unknown>).fontSize = 13;
        const issues = validateSpec(spec);
        const hit = issues.find((i) => i.code === "font-size-off-tier");
        expect(hit).toBeDefined();
        expect(hit?.severity).toBe("error");
        expect(hit?.message).toContain("最近档位为 12");
    });

    it("档位内字号不报错", () => {
        for (const tier of FONT_SIZE_TIERS) {
            const spec = baseSpec();
            (spec.objects[2] as Record<string, unknown>).fontSize = tier;
            expect(validateSpec(spec).filter((i) => i.code === "font-size-off-tier")).toHaveLength(0);
        }
    });

    it("nearestFontSizeTier 取最近档位（平局取小）", () => {
        expect(nearestFontSizeTier(13)).toBe(12);
        expect(nearestFontSizeTier(15)).toBe(14);
        expect(nearestFontSizeTier(36)).toBe(32);
    });
});

describe("组件类型决策", () => {
    it("interactive 对象缺 componentType 报 error", () => {
        const spec = baseSpec();
        const btn = spec.objects[1] as Record<string, unknown>;
        delete btn.componentType;
        const issues = validateSpec(spec);
        expect(issues.some((i) => i.code === "missing-component-type")).toBe(true);
    });

    it("interactive 对象缺 rationale 报 error", () => {
        const spec = baseSpec();
        const btn = spec.objects[1] as Record<string, unknown>;
        delete btn.rationale;
        const issues = validateSpec(spec);
        expect(issues.some((i) => i.code === "missing-rationale")).toBe(true);
    });

    it("交互类型未标记 interactive 给 warning 提示", () => {
        const spec = baseSpec();
        const btn = spec.objects[1] as Record<string, unknown>;
        delete btn.interactive;
        const issues = validateSpec(spec);
        expect(issues.some((i) => i.code === "interactive-flag" && i.severity === "warning")).toBe(true);
    });
});

describe("禁令：graph / transition", () => {
    it("type=graph 报专属禁令 error", () => {
        const spec = baseSpec();
        spec.objects.push({ name: "bg_divider", type: "graph", xy: [0, 0], size: [100, 4] });
        const issues = validateSpec(spec);
        const hit = issues.find((i) => i.code === "graph-forbidden");
        expect(hit).toBeDefined();
        expect(hit?.message).toContain("禁止 graph 组件");
    });

    it("transition 字段报禁令 error", () => {
        const spec = baseSpec();
        (spec.objects[1] as Record<string, unknown>).transition = { name: "show" };
        const issues = validateSpec(spec);
        expect(issues.some((i) => i.code === "transition-forbidden" && i.severity === "error")).toBe(true);
    });

    it("非法 type 报 invalid-type", () => {
        const spec = baseSpec();
        spec.objects.push({ name: "img_weird", type: "canvas3d", xy: [0, 0], size: [10, 10] });
        const issues = validateSpec(spec);
        expect(issues.some((i) => i.code === "invalid-type")).toBe(true);
    });
});

describe("relation sidePair", () => {
    it("sidePair 超过 2 项报 error", () => {
        const spec = baseSpec();
        (spec.objects[1] as Record<string, unknown>).relations = [{ target: "", sidePair: ["center-center", "bottom-bottom", "width-width"] }];
        const issues = validateSpec(spec);
        const hit = issues.find((i) => i.code === "side-pair-overflow");
        expect(hit).toBeDefined();
        expect(hit?.message).toContain("最多 2 项");
    });

    it("sidePair 非数组报 invalid-side-pair", () => {
        const spec = baseSpec();
        (spec.objects[1] as Record<string, unknown>).relations = [{ target: "", sidePair: "center-center" }];
        const issues = validateSpec(spec);
        expect(issues.some((i) => i.code === "invalid-side-pair")).toBe(true);
    });
});

describe("命名前缀", () => {
    it("违反语义前缀报 error", () => {
        const spec = baseSpec();
        (spec.objects[0] as Record<string, unknown>).name = "n1";
        const issues = validateSpec(spec);
        expect(issues.some((i) => i.code === "invalid-name" && i.message.includes("n1"))).toBe(true);
    });

    it("白名单前缀全部通过", () => {
        for (const prefix of NAME_PREFIXES) {
            const spec = baseSpec();
            (spec.objects[0] as Record<string, unknown>).name = `${prefix}sample`;
            expect(validateSpec(spec).filter((i) => i.code === "invalid-name")).toHaveLength(0);
        }
    });
});

describe("软规则", () => {
    it("image 缺 src 报 warning", () => {
        const spec = baseSpec();
        const img = spec.objects[0] as Record<string, unknown>;
        delete img.src;
        const issues = validateSpec(spec);
        expect(issues.some((i) => i.code === "missing-src" && i.severity === "warning")).toBe(true);
    });

    it("text 缺 fontSize 报 warning", () => {
        const spec = baseSpec();
        const txt = spec.objects[2] as Record<string, unknown>;
        delete txt.fontSize;
        const issues = validateSpec(spec);
        expect(issues.some((i) => i.code === "missing-font-size" && i.severity === "warning")).toBe(true);
    });

    it("对象缺 size 报 warning", () => {
        const spec = baseSpec();
        const img = spec.objects[0] as Record<string, unknown>;
        delete img.size;
        const issues = validateSpec(spec);
        expect(issues.some((i) => i.code === "missing-size" && i.severity === "warning")).toBe(true);
    });
});
