import type { Binding } from "../../../framework";
import type {
    AutoBattleEvent,
    AutoBattleSide,
    AutoBattleState,
    AutoBattleUnitState,
} from "../models";

/** 战场网格屏幕布局（1280×720）：敌左 3 列、己右 3 列、3 行（与 AutoBattleView 容器化对齐）。 */
const GRID_COL_STRIDE = 140;
const GRID_ROW_STRIDE = 130;
const GRID_TOP = 100;
const ENEMY_LEFT = 20;
const ALLY_LEFT = 840;
/** 战场网格列数：敌左半 3 列、己右半 3 列（对齐逻辑层 BATTLEFIELD_COLS）。 */
const GRID_COLS_PER_SIDE = 3;

/**
 * 网格格（`row:col`）→ 屏幕坐标映射（敌左、己右）：由逻辑网格行列推导
 * 单位实例在战场页的屏幕坐标，纯函数单向推导，不反向回写逻辑。列 < 3 为敌方
 * 半场、>= 3 为己方半场；行/列递增分别映射 y/x 递增。
 */
export function gridToXY(gridKey: string): { readonly x: number; readonly y: number } {
    const match = /^(\d+):(\d+)$/.exec(gridKey);
    if (match === null) {
        throw new Error(`auto-battle view: invalid grid key "${gridKey}"`);
    }
    const row = Number(match[1]);
    const col = Number(match[2]);
    const left = col < GRID_COLS_PER_SIDE ? ENEMY_LEFT : ALLY_LEFT;
    return {
        x: left + (col % GRID_COLS_PER_SIDE) * GRID_COL_STRIDE,
        y: GRID_TOP + row * GRID_ROW_STRIDE,
    };
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
export function createAutoBattleViewModel(
    state: AutoBattleState,
    log: readonly string[],
    speed: AutoBattleSpeed,
): AutoBattleViewModel {
    return {
        round: state.round,
        units: state.units.map(toUnitView),
        log,
        result: state.result,
        speed,
    };
}

/** 事件 → 日志行格式化：按事件类型生成中文描述，单位名经 nameOf 解析。 */
export function formatAutoBattleEvent(
    event: AutoBattleEvent,
    nameOf: (id: string) => string,
): string {
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
export function createAutoBattleBindings(
    commands: AutoBattleCommands,
): readonly Binding<AutoBattleViewModel>[] {
    return [
        {
            kind: "text",
            node: "txt_round",
            get: (vm) => `第 ${vm.round} 回合`,
        },
        {
            kind: "text",
            node: "txt_log",
            get: (vm) => vm.log.join("\n"),
        },
        {
            kind: "visible",
            node: "txt_result",
            get: (vm) => vm.result !== undefined,
        },
        {
            kind: "text",
            node: "txt_result",
            get: (vm) =>
                vm.result === "win" ? "胜利" : vm.result === "lose" ? "战败" : "",
        },
        { kind: "command", node: "btn_restart", run: () => commands.restart() },
        {
            kind: "text",
            node: "btn_speed",
            get: (vm) => `x${vm.speed}`,
        },
        { kind: "command", node: "btn_speed", run: () => commands.cycleSpeed() },
    ];
}

/**
 * 单个单位的动态绑定：节点名按单位 id（`unit_{id}` / `txt_unit_{id}_name` /
 * `bar_unit_{id}_hp` / `bar_unit_{id}_energy`），位置经 gridToXY 由网格坐标
 * 单向派生；文本/进度从当前 VM 按 id 解析。此绑定只为存活单位生成（见
 * buildAutoBattleBindings 过滤），阵亡单位实例由渲染层回收。
 */
export function createAutoBattleUnitBindings(
    unitId: string,
    gridKey: string,
): readonly Binding<AutoBattleViewModel>[] {
    const unitAt = (vm: AutoBattleViewModel): AutoBattleUnitView | undefined =>
        vm.units.find((unit) => unit.id === unitId);

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
                return unit !== undefined && unit.hpMax > 0
                    ? unit.hp / unit.hpMax
                    : 0;
            },
        },
        {
            kind: "progress",
            node: `bar_unit_${unitId}_energy`,
            get: (vm) => {
                const unit = unitAt(vm);
                return unit !== undefined && unit.energyMax > 0
                    ? unit.energy / unit.energyMax
                    : 0;
            },
        },
    ];
}

/**
 * 装配完整绑定集：静态标量绑定 + 按当前 VM 存活单位动态生成的单位绑定。
 * 阵亡单位（hp=0）不生成绑定，对应 UnitSlot 实例随之从容器回收（动态实例化
 * 语义，对齐 spec——绑定集随存活单位增删重建，渲染器经 setBindings 全量刷新）。
 */
export function buildAutoBattleBindings(
    commands: AutoBattleCommands,
    vm: AutoBattleViewModel,
): readonly Binding<AutoBattleViewModel>[] {
    const unitBindings = vm.units
        .filter((unit) => unit.hp > 0)
        .reduce<Binding<AutoBattleViewModel>[]>(
            (acc, unit) =>
                acc.concat(createAutoBattleUnitBindings(unit.id, unit.gridKey)),
            [],
        );
    return [...createAutoBattleBindings(commands), ...unitBindings];
}
