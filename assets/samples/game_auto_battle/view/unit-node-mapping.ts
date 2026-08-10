/**
 * 自动战斗战场页动态单位节点映射：描述"按名找不到的节点 → 运行时实例化
 * UnitSlot"的规则。纯配置数据，不依赖 fgui；由 boot 装配层喂给框架适配层的
 * 通用动态组件解析器（createDynamicComponentViewHandle）。
 */

export interface AutoBattleUnitNodeMapping {
    readonly containerName: string;
    readonly componentUrl: string;
    /** 节点名 → 动态实例目标（id + UnitSlot 内子字段；field null = 实例本身）。 */
    readonly parse: (
        name: string,
    ) => { readonly id: string; readonly field: string | null } | undefined;
}

/** 单位节点名模式 → UnitSlot 内子字段名；`null` 表示实例本身（setXY 定位）。 */
const UNIT_NODE_PATTERNS: ReadonlyArray<readonly [RegExp, string | null]> = [
    [/^unit_(.+)$/, null],
    [/^txt_unit_(.+)_name$/, "txt_name"],
    [/^txt_unit_(.+)_hp$/, "txt_hp"],
    [/^bar_unit_(.+)_hp$/, "bar_hp"],
    [/^bar_unit_(.+)_energy$/, "bar_energy"],
];

/** 战场页动态单位映射：`unit_{id}` 系列节点运行时实例化 Common/UnitSlot 组件。 */
export const AUTO_BATTLE_UNIT_NODE_MAPPING: AutoBattleUnitNodeMapping = {
    containerName: "container_units",
    componentUrl: "ui://cmn00001com03",
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
