import type { Binding } from "../../../framework";
import type { AutoBattleEvent, AutoBattleSide, AutoBattleState, AutoBattleUnitState } from "../models";
import { LOG_TEXT_NODE, RESTART_BUTTON_NODE, RESULT_PLATE_NODE, RESULT_TEXT_NODE, ROUND_TEXT_NODE, SPEED_BUTTON_NODE } from "./UiNodes";

/** 战场六边形蜂窝晶格（1280×720 画布）：扁六边形（平顶）宽 140、高 80，正确蜂窝
 *  邻接偏移 = 纵向 (0,±80) 贴边 + 斜向 (±105,±40) 贴边 → 中心公式
 *  x = X0 + 列×105，y = Y0 + 行×80 + (列%2)×40（奇数列下移半高）。全图连续
 *  贴边平铺（每格与 6 邻格共享边，无点对点接触）；外接盒超出面板边界的格不放
 *  （BattlefieldSlotsCom 由 fgui-designer 按本公式静态拼装：11 列，列高
 *  3-4-3-4-…-3 交替共 38 格，奇数列多出顶行）。布阵区为晶格中部的 4-3-4 列阵：
 *  敌方占列 1-3、己方占列 7-9（前排贴中线，中间空列 4-6），单位站位由 gridToXY
 *  落该晶格（脚底 = 六边形中心）；开战后射程不够的单位沿格前移收拢距离。 */
export const HEX_WIDTH = 140;
export const HEX_HEIGHT = 80;
/** 相邻列中心横向步距：0.75 × HEX_WIDTH（平顶六边形斜向贴边偏移）。 */
const HEX_COL_STRIDE = 105;
/** 相邻行中心纵向步距：HEX_HEIGHT（平顶六边形纵向贴边偏移）。 */
const HEX_ROW_STRIDE = 80;
/** 奇数列纵向错位：0.5 × HEX_HEIGHT（平顶六边形斜向贴边偏移）。 */
const HEX_ODD_COL_SHIFT = 40;
/** 晶格原点（0 行 0 列六边形中心）：X0=115 使 11 列覆盖面板；Y0=262 对应拼接
 *  槽位的"基准行"（逻辑行 1 = 晶格行 0，脚底 262/342/422，奇列 +40），顶部留作
 *  地图装饰场景（拼接槽位下方见 BattlefieldSlotsCom）。 */
const LATTICE_ORIGIN_X = 115;
const LATTICE_ORIGIN_Y = 262;
/** 形成区在晶格中的偏移：逻辑行 0..3 → 晶格行 -1..2（拼接槽位奇数列多出的顶行
 *  即晶格行 -1，脚底 222/302/382/462）；列直映（敌列 1-3、己列 7-9，中间空列
 *  4-6 保持布阵间距）。拼接槽位由 FGUI 组合组件（BattlefieldSlotsCom）静态平铺
 *  （11 列，列高 3-4-3-4-...-3 交替），本映射仅用于单位站位（脚底 = 六边形中心）。 */
const FORMATION_ROW_OFFSET = -1;
const FORMATION_ENEMY_COL_OFFSET = 0;
const FORMATION_ALLY_COL_OFFSET = 0;
/** 单位脚底在 UnitSlot 内的锚点（loader 底边中心，vAlign="bottom" 契约，
 *  对齐 UnitSlot.xml）。 */
const UNIT_ANCHOR_X = 60;
const UNIT_ANCHOR_Y = 236;

/** 晶格格中心坐标（正确蜂窝：纵向贴边 + 斜向贴边偏移）。 */
function latticeCenter(latticeRow: number, latticeCol: number): { readonly x: number; readonly y: number } {
    return {
        x: LATTICE_ORIGIN_X + latticeCol * HEX_COL_STRIDE,
        y: LATTICE_ORIGIN_Y + latticeRow * HEX_ROW_STRIDE + (latticeCol % 2) * HEX_ODD_COL_SHIFT,
    };
}

/**
 * 逻辑网格格（`row:col`）→ 单位槽位屏幕坐标（敌左、己右）：逻辑格映射到蜂窝
 * 晶格（行 +FORMATION_ROW_OFFSET；列直映：敌 1-3、己 7-9，col < 4 视为敌方半场
 * 否则己方），返回 UnitSlot 左上角（六边形中心 - 脚底锚点，脚底 = 六边形中心）。
 * 纯函数单向推导，不反向回写逻辑。行/列递增分别映射 y/x 递增。
 */
export function gridToXY(gridKey: string): { readonly x: number; readonly y: number } {
    const match = /^(\d+):(\d+)$/.exec(gridKey);
    if (match === null) {
        throw new Error(`auto-battle view: invalid grid key "${gridKey}"`);
    }
    const row = Number(match[1]);
    const col = Number(match[2]);
    // 敌方半场 = 列 < 4（布阵区列 1-3，含前方空列），己方 = 其余（列 7-9）
    const latticeCol = col + (col < 4 ? FORMATION_ENEMY_COL_OFFSET : FORMATION_ALLY_COL_OFFSET);
    const center = latticeCenter(row + FORMATION_ROW_OFFSET, latticeCol);
    return { x: center.x - UNIT_ANCHOR_X, y: center.y - UNIT_ANCHOR_Y };
}

/** 单位页面呈现数据：只承载节点需要的字段，不含战斗逻辑。 */
export interface AutoBattleUnitView {
    readonly id: string;
    readonly name: string;
    readonly side: AutoBattleSide;
    /** 队内压缩序 0..上阵数-1（镜像逻辑层 index；不参与节点寻址，节点按 id 绑定）。 */
    readonly index: number;
    /** 当前所在网格格（屏幕坐标由 gridToXY 单向推导）。 */
    readonly gridKey: string;
    readonly hp: number;
    readonly hpMax: number;
    readonly energy: number;
    readonly energyMax: number;
}

/** 观战加速挡位：只改变驱动节拍，不改变战斗结果。 */
export type AutoBattleSpeed = 1 | 2 | 3;

/** 战场页 ViewModel：从战斗状态与事件日志派生的纯呈现数据。 */
export interface AutoBattleViewModel {
    readonly round: number;
    /** 单位静态槽位数据（先己方后敌方，index 为队内逻辑槽位序号 0..N-1）。 */
    readonly units: readonly AutoBattleUnitView[];
    readonly log: readonly string[];
    readonly result: "win" | "lose" | undefined;
    /** 当前观战加速挡位。 */
    readonly speed: AutoBattleSpeed;
}

/** 战场页绑定命令：重开与挡位切换，由调用方注入战斗/驱动操作。 */
export interface AutoBattleCommands {
    restart(): void;
    /** 循环切换加速挡位（1x → 2x → 3x → 1x）。 */
    cycleSpeed(): void;
}

/** 单位运行时快照 → 页面呈现数据：side/index/gridKey 承载槽位与网格寻址。 */
function toUnitView(unit: AutoBattleUnitState): AutoBattleUnitView {
    return {
        id: unit.id,
        name: unit.name,
        side: unit.side,
        index: unit.index,
        gridKey: unit.gridKey,
        hp: unit.hp,
        hpMax: unit.maxHp,
        energy: unit.energy,
        energyMax: unit.energyMax,
    };
}

/** VM 派生：把战斗状态与事件日志映射为页面呈现数据。 */
export function createAutoBattleViewModel(state: AutoBattleState, log: readonly string[], speed: AutoBattleSpeed): AutoBattleViewModel {
    return {
        round: state.round,
        units: state.units.map(toUnitView),
        log,
        result: state.result,
        speed,
    };
}

/** 事件 → 日志行格式化：按事件类型生成中文描述，单位名经 nameOf 解析。 */
export function formatAutoBattleEvent(event: AutoBattleEvent, nameOf: (id: string) => string): string {
    const source = event.sourceId === "" ? "" : nameOf(event.sourceId);
    const target = event.targetId === undefined ? "" : nameOf(event.targetId);

    switch (event.type) {
        case "round-start":
            return `第 ${event.round} 回合开始`;
        case "attack":
            return `${source} 攻击 ${target}，造成 ${event.value} 伤害`;
        case "skill-damage":
            return `${source} 释放技能，对 ${target} 造成 ${event.value} 伤害`;
        case "skill-heal":
            return `${source} 释放技能，治疗 ${target} ${event.value} 点`;
        case "unit-dead":
            return `${target} 阵亡`;
        case "battle-over":
            return event.result === "win" ? "战斗结束：胜利" : "战斗结束：战败";
        case "restart":
            return "对局已重开";
        default:
            return "";
    }
}

/**
 * 战场页绑定声明（静态标量部分）：描述 VM 标量字段到 FGUI 节点名的映射
 * （纯数据，不含渲染逻辑，不导入 fgui）。节点名与 BattleView.xml 子元素名
 * 对齐（txt_/bar_/btn_ 前缀）。单位实例绑定不在此——按存活单位动态生成
 * （见 createAutoBattleUnitBindings / buildAutoBattleBindings）。
 */
export function createAutoBattleBindings(commands: AutoBattleCommands): readonly Binding<AutoBattleViewModel>[] {
    return [
        {
            kind: "text",
            node: ROUND_TEXT_NODE,
            get: (vm) => `第 ${vm.round} 回合`,
        },
        {
            kind: "text",
            node: LOG_TEXT_NODE,
            get: (vm) => vm.log.join("\n"),
        },
        {
            kind: "visible",
            node: RESULT_TEXT_NODE,
            get: (vm) => vm.result !== undefined,
        },
        {
            kind: "visible",
            node: RESULT_PLATE_NODE,
            get: (vm) => vm.result !== undefined,
        },
        {
            kind: "text",
            node: RESULT_TEXT_NODE,
            get: (vm) => (vm.result === "win" ? "胜利" : vm.result === "lose" ? "战败" : ""),
        },
        { kind: "command", node: RESTART_BUTTON_NODE, run: () => commands.restart() },
        {
            kind: "text",
            node: SPEED_BUTTON_NODE,
            get: (vm) => `x${vm.speed}`,
        },
        { kind: "command", node: SPEED_BUTTON_NODE, run: () => commands.cycleSpeed() },
    ];
}

/**
 * 单个单位的动态绑定：节点名按单位 id（`unit_{id}` / `txt_unit_{id}_name` /
 * `bar_unit_{id}_hp` / `bar_unit_{id}_energy`），位置经 gridToXY 由网格坐标
 * 单向派生；文本/进度从当前 VM 按 id 解析。此绑定只为存活单位生成（见
 * buildAutoBattleBindings 过滤），阵亡单位实例由渲染层回收。
 */
export function createAutoBattleUnitBindings(unitId: string, gridKey: string): readonly Binding<AutoBattleViewModel>[] {
    const unitAt = (vm: AutoBattleViewModel): AutoBattleUnitView | undefined => vm.units.find((unit) => unit.id === unitId);

    return [
        {
            kind: "visible",
            node: `unit_${unitId}`,
            get: () => true,
        },
        {
            kind: "position",
            node: `unit_${unitId}`,
            get: () => gridToXY(gridKey),
        },
        {
            kind: "text",
            node: `txt_unit_${unitId}_name`,
            get: (vm) => unitAt(vm)?.name ?? "",
        },
        {
            kind: "text",
            node: `txt_unit_${unitId}_hp`,
            get: (vm) => {
                const unit = unitAt(vm);
                return unit === undefined ? "" : `HP ${unit.hp}/${unit.hpMax}`;
            },
        },
        {
            kind: "progress",
            node: `bar_unit_${unitId}_hp`,
            get: (vm) => {
                const unit = unitAt(vm);
                return unit !== undefined && unit.hpMax > 0 ? unit.hp / unit.hpMax : 0;
            },
        },
        {
            kind: "progress",
            node: `bar_unit_${unitId}_energy`,
            get: (vm) => {
                const unit = unitAt(vm);
                return unit !== undefined && unit.energyMax > 0 ? unit.energy / unit.energyMax : 0;
            },
        },
    ];
}

/**
 * 装配完整绑定集：静态标量绑定 + 按当前 VM 存活单位动态生成的单位绑定。
 * 阵亡单位（hp=0）不生成绑定，对应 UnitSlot 实例随之从容器回收（动态实例化
 * 语义，对齐 spec——绑定集随存活单位增删重建，渲染器经 setBindings 全量刷新）。
 */
export function buildAutoBattleBindings(commands: AutoBattleCommands, vm: AutoBattleViewModel): readonly Binding<AutoBattleViewModel>[] {
    const unitBindings = vm.units.filter((unit) => unit.hp > 0).reduce<Binding<AutoBattleViewModel>[]>((acc, unit) => acc.concat(createAutoBattleUnitBindings(unit.id, unit.gridKey)), []);
    return [...createAutoBattleBindings(commands), ...unitBindings];
}
