import type { Binding } from "../../../framework";
import type {
    AutoBattleEvent,
    AutoBattleState,
    AutoBattleUnitState,
} from "../models";

/** 单位页面呈现数据：只承载节点需要的字段，不含战斗逻辑。 */
export interface AutoBattleUnitView {
    readonly id: string;
    readonly name: string;
    readonly hp: number;
    readonly hpMax: number;
    readonly energy: number;
    readonly energyMax: number;
}

/** 战场页 ViewModel：从战斗状态与事件日志派生的纯呈现数据。 */
export interface AutoBattleViewModel {
    readonly round: number;
    /** 单位静态槽位数据（先己方后敌方，index 0-5）。 */
    readonly units: readonly AutoBattleUnitView[];
    readonly log: readonly string[];
    readonly result: "win" | "lose" | undefined;
}

/** 战场页绑定命令：重开，由调用方注入战斗操作。 */
export interface AutoBattleCommands {
    restart(): void;
}

/** 单位运行时快照 → 页面呈现数据。 */
function toUnitView(unit: AutoBattleUnitState): AutoBattleUnitView {
    return {
        id: unit.id,
        name: unit.name,
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
): AutoBattleViewModel {
    return {
        round: state.round,
        units: state.units.map(toUnitView),
        log,
        result: state.result,
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
 * 战场页绑定声明：描述 VM 字段到 FGUI 节点名的映射（纯数据，不含渲染逻辑，
 * 不导入 fgui）。节点名与 BattleView.xml 子元素名对齐（txt_/bar_/btn_ 前缀）。
 * 单位采用固定 3v3 静态槽位 unit_{index}_*（index 0-5，先己方后敌方），
 * 不引入列表绑定框架能力（MVP 范围，Phase 2 可变编队需另行评估）。
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
        { kind: "command", node: "btn_restart", run: () => commands.restart() },
    ];

    for (let index = 0; index < 6; index += 1) {
        bindings.push(
            {
                kind: "text",
                node: `txt_unit_${index}_name`,
                get: (vm) => vm.units[index]?.name ?? "",
            },
            {
                kind: "text",
                node: `txt_unit_${index}_hp`,
                get: (vm) => {
                    const unit = vm.units[index];
                    return unit === undefined ? "" : `HP ${unit.hp}/${unit.hpMax}`;
                },
            },
            {
                kind: "progress",
                node: `bar_unit_${index}_hp`,
                get: (vm) => {
                    const unit = vm.units[index];
                    return unit !== undefined && unit.hpMax > 0
                        ? unit.hp / unit.hpMax
                        : 0;
                },
            },
            {
                kind: "progress",
                node: `bar_unit_${index}_energy`,
                get: (vm) => {
                    const unit = vm.units[index];
                    return unit !== undefined && unit.energyMax > 0
                        ? unit.energy / unit.energyMax
                        : 0;
                },
            },
        );
    }

    return bindings;
}
