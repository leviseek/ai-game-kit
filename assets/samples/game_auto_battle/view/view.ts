import type { Binding } from "../../../framework";
import { MAX_TEAM_SIZE } from "../logic/config";
import type {
    AutoBattleEvent,
    AutoBattleSide,
    AutoBattleState,
    AutoBattleUnitState,
} from "../models";

/** 槽位列横坐标：敌左（20）、己右（1040），1280×720 布局口径。 */
const SLOT_COLUMN_X: Readonly<Record<AutoBattleSide, number>> = {
    ally: 1040,
    enemy: 20,
};

/** 槽位纵向带：起点与固定步进，6 槽/侧在带内自上而下排布（末槽底避开日志区）。 */
const SLOT_BAND_TOP = 60;
const SLOT_BAND_STRIDE = 72;

/** 单位页面呈现数据：只承载节点需要的字段，不含战斗逻辑。 */
export interface AutoBattleUnitView {
    readonly id: string;
    readonly name: string;
    readonly side: AutoBattleSide;
    /** 队内逻辑槽位序号 0..N-1（镜像逻辑层 index，用于槽位寻址与映射推导）。 */
    readonly index: number;
    readonly hp: number;
    readonly hpMax: number;
    readonly energy: number;
    readonly energyMax: number;
}

/**
 * 槽位 → 屏幕坐标映射（敌左、己右）：由队内槽位序号与单侧规模推导坐标，
 * 纯函数单向推导，不反向回写逻辑。slotIndex 为队内参数（0..N-1），teamSize
 * 为单侧规模，两侧各自独立推导；团队块在带内垂直居中，较小规模整块下移。
 * 渲染绑定节点名使用全局索引 = side 偏移（己方 0、敌方 MAX_TEAM_SIZE）+
 * 队内 slotIndex，避免 6v6 时敌我两侧队内序号相同而拼出冲突节点名。
 */
export function slotToXY(
    side: AutoBattleSide,
    slotIndex: number,
    teamSize: number,
): { x: number; y: number } {
    const blockOffset = ((MAX_TEAM_SIZE - teamSize) * SLOT_BAND_STRIDE) / 2;
    return {
        x: SLOT_COLUMN_X[side],
        y: SLOT_BAND_TOP + blockOffset + slotIndex * SLOT_BAND_STRIDE,
    };
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

/** 单位运行时快照 → 页面呈现数据：side/index 承载槽位寻址与映射推导。 */
function toUnitView(unit: AutoBattleUnitState): AutoBattleUnitView {
    return {
        id: unit.id,
        name: unit.name,
        side: unit.side,
        index: unit.index,
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

/** 在 VM 单位清单中按 side + 队内槽位序号定位单位；未上阵返回 undefined。 */
function unitAtSlot(
    units: readonly AutoBattleUnitView[],
    side: AutoBattleSide,
    slotIndex: number,
): AutoBattleUnitView | undefined {
    return units.find((unit) => unit.side === side && unit.index === slotIndex);
}

/** 单侧上阵单位数（teamSize 口径：各侧独立推导，供 slotToXY 映射）。 */
function sideTeamSize(
    units: readonly AutoBattleUnitView[],
    side: AutoBattleSide,
): number {
    return units.filter((unit) => unit.side === side).length;
}

/**
 * 战场页绑定声明：描述 VM 字段到 FGUI 节点名的映射（纯数据，不含渲染逻辑，
 * 不导入 fgui）。节点名与 BattleView.xml 子元素名对齐（txt_/bar_/btn_ 前缀）。
 * 单位按 MAX_TEAM_SIZE 预置全局槽位（先己方后敌方，全局索引 = side 偏移 +
 * 队内 slotIndex，己方偏移 0、敌方偏移 MAX_TEAM_SIZE），超出实际规模的槽位
 * 由 visible 绑定整组隐藏，position 绑定经 slotToXY 映射到屏幕坐标；文本/
 * 进度绑定节点名约定不变，仍按全局索引寻址。
 */
export function createAutoBattleBindings(
    commands: AutoBattleCommands,
): readonly Binding<AutoBattleViewModel>[] {
    const bindings: Binding<AutoBattleViewModel>[] = [
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
        {
            kind: "text",
            node: "txt_speed",
            get: (vm) => `x${vm.speed}`,
        },
        { kind: "command", node: "btn_restart", run: () => commands.restart() },
        { kind: "command", node: "btn_speed", run: () => commands.cycleSpeed() },
    ];

    // 预置 2*MAX_TEAM_SIZE 个全局槽位（unit_{全局索引}），按单位是否存在驱动
    // 显隐、按 slotToXY 映射驱动坐标；文本/进度沿用 txt_unit_/bar_unit_ 约定。
    for (let globalIndex = 0; globalIndex < MAX_TEAM_SIZE * 2; globalIndex += 1) {
        const side: AutoBattleSide =
            globalIndex < MAX_TEAM_SIZE ? "ally" : "enemy";
        const slotIndex =
            globalIndex < MAX_TEAM_SIZE ? globalIndex : globalIndex - MAX_TEAM_SIZE;
        const unitAt = (vm: AutoBattleViewModel): AutoBattleUnitView | undefined =>
            unitAtSlot(vm.units, side, slotIndex);

        bindings.push(
            {
                kind: "visible",
                node: `unit_${globalIndex}`,
                get: (vm) => unitAt(vm) !== undefined,
            },
            {
                kind: "position",
                node: `unit_${globalIndex}`,
                get: (vm) => slotToXY(side, slotIndex, sideTeamSize(vm.units, side)),
            },
            {
                kind: "text",
                node: `txt_unit_${globalIndex}_name`,
                get: (vm) => unitAt(vm)?.name ?? "",
            },
            {
                kind: "text",
                node: `txt_unit_${globalIndex}_hp`,
                get: (vm) => {
                    const unit = unitAt(vm);
                    return unit === undefined ? "" : `HP ${unit.hp}/${unit.hpMax}`;
                },
            },
            {
                kind: "progress",
                node: `bar_unit_${globalIndex}_hp`,
                get: (vm) => {
                    const unit = unitAt(vm);
                    return unit !== undefined && unit.hpMax > 0
                        ? unit.hp / unit.hpMax
                        : 0;
                },
            },
            {
                kind: "progress",
                node: `bar_unit_${globalIndex}_energy`,
                get: (vm) => {
                    const unit = unitAt(vm);
                    return unit !== undefined && unit.energyMax > 0
                        ? unit.energy / unit.energyMax
                        : 0;
                },
            },
        );
    }

    return bindings;
}
