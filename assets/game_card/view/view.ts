import type { Binding } from "../../framework";
import type { CardBattleState } from "../models";

/**
 * 战场页 ViewModel：从战斗状态派生的纯呈现数据，只承载节点需要的字段，
 * 不包含战斗逻辑。结果（result）与数值用于文本/进度/显隐绑定。
 */
export interface CardBattleViewModel {
    readonly playerHp: number;
    readonly enemyHp: number;
    readonly enemyHpMax: number;
    readonly mana: number;
    readonly result: "win" | "lose" | undefined;
}

/** 战场页绑定命令：出牌/结束回合/重开，由调用方注入战斗操作。 */
export interface CardBattleCommands {
    playCard(index: number): void;
    endTurn(): void;
    restart(): void;
}

/** VM 派生：把战斗状态映射为页面呈现数据。 */
export function createCardBattleViewModel(
    state: CardBattleState,
    enemyHpMax: number,
): CardBattleViewModel {
    return {
        playerHp: state.playerHp,
        enemyHp: state.enemyHp,
        enemyHpMax,
        mana: state.mana,
        result: state.result,
    };
}

/**
 * 战场页绑定声明：描述 VM 字段到 FGUI 节点名的映射（纯数据，不含渲染逻辑，
 * 不导入 fgui）。节点名与 BattleView.xml 子元素名对齐（txt_/bar_/btn_ 前缀）。
 * 命令绑定把节点点击接入战斗操作。
 */
export function createCardBattleBindings(
    commands: CardBattleCommands,
): readonly Binding<CardBattleViewModel>[] {
    return [
        { kind: "text", node: "txt_player_hp", get: (vm) => `HP ${vm.playerHp}` },
        { kind: "text", node: "txt_enemy_hp", get: (vm) => `HP ${vm.enemyHp}` },
        { kind: "text", node: "txt_mana", get: (vm) => `${vm.mana}` },
        {
            kind: "progress",
            node: "bar_enemy_hp",
            get: (vm) => (vm.enemyHpMax > 0 ? vm.enemyHp / vm.enemyHpMax : 0),
        },
        { kind: "command", node: "btn_card_0", run: () => commands.playCard(0) },
        { kind: "command", node: "btn_card_1", run: () => commands.playCard(1) },
        { kind: "command", node: "btn_card_2", run: () => commands.playCard(2) },
        { kind: "command", node: "btn_end_turn", run: () => commands.endTurn() },
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
}
