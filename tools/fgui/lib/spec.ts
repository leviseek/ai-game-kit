/**
 * UI spec 结构化校验：fgui-designer 的文本 UI spec 的机器可校验 JSON 形态。
 * 说明：tasks 4.1 原计划使用 zod，但 .ai/instructions.md 第 3 条禁止引入第三方运行时依赖
 * （允许清单仅 typescript/eslint/typescript-eslint/@types/node），故改用手写类型化校验器，
 * 规则语义与 design D5 一致：硬规则 error、软规则 warning 分级。
 */

/** 合法对象类型（graph 被排除并单独报禁令）。 */
export const SPEC_OBJECT_TYPES = [
    "image",
    "text",
    "loader",
    "component",
    "list",
    "group",
    "button",
    "progressbar",
    "slider",
    "combobox",
    "textinput",
    "richtext",
] as const;

/** 字号档位表（与 fgui-designer 一致，禁止中间值）。 */
export const FONT_SIZE_TIERS = [12, 14, 16, 18, 20, 24, 28, 32, 40] as const;

/** 语义化命名前缀白名单（fgui-designer 推荐前缀）。 */
export const NAME_PREFIXES = [
    "txt_",
    "btn_",
    "bg_",
    "bar_",
    "loader_",
    "img_",
    "input_",
    "list_",
    "popup_",
    "panel_",
    "combo_",
    "icon_",
    "frame_",
    "grip_",
    "title_",
    "item_",
    "scrollbar_",
    "slider_",
] as const;

/** 可交互对象类型（interactive 标记必须给出组件类型决策）。 */
const INTERACTIVE_TYPES = new Set(["button", "slider", "progressbar", "combobox", "list", "textinput"]);

export interface SpecRelation {
    readonly target: string;
    readonly sidePair: readonly string[];
}

export interface SpecObject {
    readonly name: string;
    readonly type: string;
    readonly interactive?: boolean;
    readonly componentType?: string;
    readonly rationale?: string;
    readonly xy?: readonly [number, number];
    readonly size?: readonly [number, number];
    readonly fontSize?: number;
    readonly color?: string;
    readonly src?: string;
    readonly relations?: readonly SpecRelation[];
    /** 禁止字段：出现即违反项目禁令（动画由 TS 推进 controller）。 */
    readonly transition?: unknown;
}

export interface UiSpec {
    readonly canvas: { readonly width: number; readonly height: number };
    readonly package: string;
    readonly objects: readonly SpecObject[];
    readonly pending?: readonly string[];
}

export interface SpecIssue {
    readonly severity: "error" | "warning";
    readonly code: string;
    readonly message: string;
    readonly path?: string;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isNumberPair(value: unknown): value is readonly [number, number] {
    return Array.isArray(value) && value.length === 2 && isFiniteNumber(value[0]) && isFiniteNumber(value[1]);
}

/** 返回距 value 最近的字号档位（用于错误提示）。 */
export function nearestFontSizeTier(value: number): number {
    return FONT_SIZE_TIERS.reduce((best, tier) => (Math.abs(tier - value) < Math.abs(best - value) ? tier : best), FONT_SIZE_TIERS[0]);
}

/**
 * 校验 UI spec（输入为 JSON.parse 结果，unknown 形态做类型防御）。
 * 硬规则（error）：结构缺失/类型错误、graph 禁令、transition 禁令、interactive 决策缺失、
 *   非档位字号、relation sidePair>2、无语义命名。
 * 软规则（warning）：image/loader/component 缺 src、text 缺字号、对象缺尺寸。
 */
export function validateSpec(input: unknown): SpecIssue[] {
    const issues: SpecIssue[] = [];

    if (input === null || typeof input !== "object" || Array.isArray(input)) {
        return [{ severity: "error", code: "not-object", message: "UI spec 顶层必须是 JSON 对象" }];
    }
    const spec = input as Record<string, unknown>;

    // canvas
    const canvas = spec.canvas;
    if (canvas === null || typeof canvas !== "object" || Array.isArray(canvas)) {
        issues.push({ severity: "error", code: "invalid-canvas", message: "canvas 必填：{ width, height }" });
    } else {
        const c = canvas as Record<string, unknown>;
        if (!isFiniteNumber(c.width) || c.width <= 0) issues.push({ severity: "error", code: "invalid-canvas", message: "canvas.width 必须为正数", path: "canvas.width" });
        if (!isFiniteNumber(c.height) || c.height <= 0) issues.push({ severity: "error", code: "invalid-canvas", message: "canvas.height 必须为正数", path: "canvas.height" });
    }

    // package
    if (typeof spec.package !== "string" || spec.package.length === 0) {
        issues.push({ severity: "error", code: "invalid-package", message: "package 必填：目标包名（如 Demo）" });
    }

    // objects
    if (!Array.isArray(spec.objects)) {
        issues.push({ severity: "error", code: "invalid-objects", message: "objects 必填：从底到顶的布局树数组" });
        return issues;
    }

    spec.objects.forEach((raw, index) => {
        const path = `objects[${index}]`;
        if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
            issues.push({ severity: "error", code: "invalid-object", message: `${path} 必须是对象` });
            return;
        }
        const obj = raw as Record<string, unknown>;
        const name = obj.name;

        // name 语义前缀（硬）
        if (typeof name !== "string" || name.length === 0) {
            issues.push({ severity: "error", code: "missing-name", message: `${path} 缺少 name` });
        } else if (!NAME_PREFIXES.some((prefix) => name.startsWith(prefix))) {
            issues.push({
                severity: "error",
                code: "invalid-name",
                message: `${path} name "${name}" 违反语义化前缀约定（应为 ${NAME_PREFIXES.slice(0, 6).join("/")} 等）`,
                path: `${path}.name`,
            });
        }

        // type（graph 禁令）
        if (typeof obj.type !== "string" || obj.type.length === 0) {
            issues.push({ severity: "error", code: "missing-type", message: `${path} 缺少 type` });
        } else if (obj.type === "graph") {
            issues.push({ severity: "error", code: "graph-forbidden", message: `${path} 禁止 graph 组件：纯色视觉必须用 sprite 生成图片并以 image 引用` });
        } else if (!(SPEC_OBJECT_TYPES as readonly string[]).includes(obj.type)) {
            issues.push({ severity: "error", code: "invalid-type", message: `${path} type "${obj.type}" 非法（合法: ${SPEC_OBJECT_TYPES.join("/")}）` });
        }

        // transition 禁令
        if ("transition" in obj && obj.transition !== undefined) {
            issues.push({ severity: "error", code: "transition-forbidden", message: `${path} 禁止手写 transition：动画由 TS 推进 controller selectedIndex` });
        }

        // interactive 决策
        if (obj.interactive !== undefined && typeof obj.interactive !== "boolean") {
            issues.push({ severity: "error", code: "invalid-interactive", message: `${path} interactive 必须是布尔值` });
        }
        const interactive = obj.interactive === true;
        const isInteractiveType = typeof obj.type === "string" && INTERACTIVE_TYPES.has(obj.type);
        if (interactive) {
            if (typeof obj.componentType !== "string" || obj.componentType.length === 0) {
                issues.push({ severity: "error", code: "missing-component-type", message: `${path} interactive 对象必须声明 componentType（组件类型决策）` });
            }
            if (typeof obj.rationale !== "string" || obj.rationale.length === 0) {
                issues.push({ severity: "error", code: "missing-rationale", message: `${path} interactive 对象必须声明 rationale（选择依据）` });
            }
        } else if (isInteractiveType && typeof obj.type === "string" && obj.type !== "list") {
            // 交互类型对象应标记 interactive；list 容器本身可不标记（其 item 负责交互）
            issues.push({ severity: "warning", code: "interactive-flag", message: `${path} type=${obj.type} 为交互类型，建议标记 interactive 并给出组件类型决策` });
        }

        // xy / size
        if (obj.xy !== undefined && !isNumberPair(obj.xy)) {
            issues.push({ severity: "error", code: "invalid-xy", message: `${path} xy 必须为 [x, y] 数字对` });
        }
        if (obj.size !== undefined && !isNumberPair(obj.size)) {
            issues.push({ severity: "error", code: "invalid-size", message: `${path} size 必须为 [w, h] 数字对` });
        } else if (obj.size === undefined) {
            issues.push({ severity: "warning", code: "missing-size", message: `${path} 缺少 size，建议显式声明` });
        }

        // fontSize 档位（硬）
        if (obj.fontSize !== undefined) {
            if (!isFiniteNumber(obj.fontSize)) {
                issues.push({ severity: "error", code: "invalid-font-size", message: `${path} fontSize 必须是数字` });
            } else if (!(FONT_SIZE_TIERS as readonly number[]).includes(obj.fontSize)) {
                issues.push({
                    severity: "error",
                    code: "font-size-off-tier",
                    message: `${path} fontSize ${obj.fontSize} 不在档位表内，最近档位为 ${nearestFontSizeTier(obj.fontSize)}`,
                    path: `${path}.fontSize`,
                });
            }
        } else if (obj.type === "text" || obj.type === "textinput" || obj.type === "richtext") {
            issues.push({ severity: "warning", code: "missing-font-size", message: `${path} 文本对象未声明 fontSize` });
        }

        // src 引用（软）
        const srcRequiredTypes = ["image", "loader", "component"];
        if (typeof obj.type === "string" && srcRequiredTypes.includes(obj.type) && (typeof obj.src !== "string" || obj.src.length === 0)) {
            issues.push({ severity: "warning", code: "missing-src", message: `${path} ${obj.type} 未声明 src（应引用 package.xml 已登记资源 id）` });
        }

        // relations sidePair ≤ 2（硬）
        if (obj.relations !== undefined) {
            if (!Array.isArray(obj.relations)) {
                issues.push({ severity: "error", code: "invalid-relations", message: `${path} relations 必须是数组` });
            } else {
                obj.relations.forEach((rel, relIndex) => {
                    const relPath = `${path}.relations[${relIndex}]`;
                    if (rel === null || typeof rel !== "object" || Array.isArray(rel)) {
                        issues.push({ severity: "error", code: "invalid-relation", message: `${relPath} 必须是对象` });
                        return;
                    }
                    const r = rel as Record<string, unknown>;
                    if (!Array.isArray(r.sidePair)) {
                        issues.push({ severity: "error", code: "invalid-side-pair", message: `${relPath} sidePair 必须是数组` });
                    } else if (r.sidePair.length > 2) {
                        issues.push({
                            severity: "error",
                            code: "side-pair-overflow",
                            message: `${relPath} sidePair 最多 2 项（横向与纵向各一项），当前 ${r.sidePair.length} 项`,
                            path: `${relPath}.sidePair`,
                        });
                    }
                });
            }
        }
    });

    return issues;
}
