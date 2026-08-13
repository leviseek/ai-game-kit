/**
 * 自动战斗战场页动态单位节点映射：描述"按名找不到的节点 → 运行时实例化
 * UnitSlot"的规则。纯配置数据（资源 URL 引用 ui/generated/ 生成常量），
 * 不依赖 fgui；由 boot 装配层喂给框架适配层的通用动态组件解析器
 * （createDynamicComponentViewHandle）。
 */

import { UiAutoBattleUnitHitFeedbackCom } from "../../../ui/generated/ui-autobattle";
import { UiCommonUnitSlot } from "../../../ui/generated/ui-common";
import { FX_CONTAINER, FX_FLASH_NODE, FX_FLOAT_NODE, UNIT_ENERGY_BAR_NODE, UNIT_HP_BAR_NODE, UNIT_HP_TEXT_NODE, UNIT_NAME_NODE, UNIT_SLOT_CONTAINER } from "./UiNodes";

export interface AutoBattleUnitNodeMapping {
    readonly containerName: string;
    readonly componentUrl: string;
    /** 节点名 → 动态实例目标（id + UnitSlot 内子字段；field null = 实例本身）。 */
    readonly parse: (name: string) => { readonly id: string; readonly field: string | null } | undefined;
    /** 可选活跃 id 推导：缺省按 parse(nodeNames) 推导，提供则用该函数（见 FX 映射）。 */
    readonly activeIds?: (nodeNames: readonly string[]) => ReadonlySet<string>;
}

/** 单位节点名模式 → UnitSlot 内子字段名；`null` 表示实例本身（setXY 定位）。 */
const UNIT_NODE_PATTERNS: ReadonlyArray<readonly [RegExp, string | null]> = [
    [/^unit_(.+)$/, null],
    [/^txt_unit_(.+)_name$/, UNIT_NAME_NODE],
    [/^txt_unit_(.+)_hp$/, UNIT_HP_TEXT_NODE],
    [/^bar_unit_(.+)_hp$/, UNIT_HP_BAR_NODE],
    [/^bar_unit_(.+)_energy$/, UNIT_ENERGY_BAR_NODE],
];

/** 战场页动态单位映射：`unit_{id}` 系列节点运行时实例化 Common/UnitSlot 组件。 */
export const AUTO_BATTLE_UNIT_NODE_MAPPING: AutoBattleUnitNodeMapping = {
    containerName: UNIT_SLOT_CONTAINER,
    componentUrl: UiCommonUnitSlot,
    parse: (name) => {
        for (const [pattern, field] of UNIT_NODE_PATTERNS) {
            const match = pattern.exec(name);
            if (match !== null) {
                return { id: match[1]!, field };
            }
        }
        return undefined;
    },
};

/** 命中反馈节点名模式 → UnitHitFeedbackCom 内子字段名（field null 表示实例本身）。 */
const FX_NODE_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
    [/^fx_float_(.+)$/, FX_FLOAT_NODE],
    [/^fx_flash_(.+)$/, FX_FLASH_NODE],
];

/**
 * 战场页命中反馈动态映射：`fx_float_{unitId}` / `fx_flash_{unitId}` 节点运行时
 * 实例化 AutoBattle/UnitHitFeedbackCom（每单位一个特效实例，字段为飘字文本 /
 * 闪白遮罩）。特效节点名不在 ViewModel 绑定集内（动画器直接寻址），活跃 id 从
 * `unit_{id}` 绑定节点推导——单位阵亡时其 UnitSlot 与特效实例一起回收。
 */
export const AUTO_BATTLE_FX_NODE_MAPPING: AutoBattleUnitNodeMapping = {
    containerName: FX_CONTAINER,
    componentUrl: UiAutoBattleUnitHitFeedbackCom,
    parse: (name) => {
        for (const [pattern, field] of FX_NODE_PATTERNS) {
            const match = pattern.exec(name);
            if (match !== null) {
                return { id: match[1]!, field };
            }
        }
        return undefined;
    },
    activeIds: (nodeNames) => {
        const ids = new Set<string>();
        for (const name of nodeNames) {
            const match = /^unit_(.+)$/.exec(name);
            if (match !== null) {
                ids.add(match[1]!);
            }
        }
        return ids;
    },
};

/** 战场页全部动态节点映射：单位实例 + 命中反馈特效实例（装配层按序匹配）。 */
export const AUTO_BATTLE_DYNAMIC_NODE_MAPPINGS: readonly AutoBattleUnitNodeMapping[] = [AUTO_BATTLE_UNIT_NODE_MAPPING, AUTO_BATTLE_FX_NODE_MAPPING];
