import type { Binding } from "../../../framework";
import { FORMATION_GRID_SIZE } from "../logic/grid";
import { MAX_TEAM_SIZE } from "../logic/config";
import type { AutoBattleHero, AutoBattleLineup } from "../models";
import { text } from "../../../game-content/generated/i18n";

/** 编队页布阵区格位呈现：占用英雄或空。 */
export interface LineupSlotView {
    readonly slot: number;
    readonly heroId: string | null;
    readonly heroName: string;
}

/** 编队页候选英雄呈现：池内英雄 + 是否已上阵。 */
export interface LineupCandidateView {
    readonly heroId: string;
    readonly heroName: string;
    readonly deployed: boolean;
}

/** 编队页 ViewModel：候选英雄区 + 布阵区（容量 FORMATION_GRID_SIZE 槽，上阵上限 MAX_TEAM_SIZE） + 选中格。 */
export interface LineupEditorViewModel {
    readonly candidates: readonly LineupCandidateView[];
    readonly slots: readonly LineupSlotView[];
    /** 当前选中的布阵格；null = 未选中。 */
    readonly selectedSlot: number | null;
    /** 当前实际上阵数。 */
    readonly deployedCount: number;
    /** 至少上阵一个英雄后才允许开战。 */
    readonly canStart: boolean;
}

/** 编队页命令：点击选择（D3），由调用方注入编辑/持久化/开战操作。 */
export interface LineupEditorCommands {
    /** 点击布阵格：未选中则选中；已选中则取消选中（null = 取消选中）。 */
    selectSlot(slot: number | null): void;
    /** 点击候选英雄：填入选中的布阵格，否则填入第一个空槽（英雄唯一性由 reducer 保证）。 */
    selectHero(heroId: string): void;
    /** 卸下指定槽位英雄（点击已上阵英雄二次触发）。 */
    removeFromSlot(slot: number): void;
    /** 以当前编队开始战斗（开战由 lineup 实例化）。 */
    startBattle(): void;
    /** 打开挂机收益页（会话内页面切换）。 */
    openIdleRewards(): void;
}

function twoDigits(value: number): string {
    return value < 10 ? `0${value}` : String(value);
}

/** 编队页 VM 派生：候选区 = 英雄池（含上阵态），布阵区 = 定长槽（含选中格）。 */
export function createLineupEditorViewModel(heroes: readonly AutoBattleHero[], lineup: AutoBattleLineup, selectedSlot: number | null): LineupEditorViewModel {
    const deployed = new Set(lineup.slots.filter((heroId): heroId is string => heroId !== null));
    const deployedCount = deployed.size;

    return {
        candidates: heroes.map((hero) => ({
            heroId: hero.id,
            heroName: text.getOr(hero.name, hero.name),
            deployed: deployed.has(hero.id),
        })),
        slots: lineup.slots.map((heroId, slot) => {
            const hero = heroId === null ? undefined : heroes.find((h) => h.id === heroId);
            return { slot, heroId, heroName: hero === undefined ? "" : text.getOr(hero.name, hero.name) };
        }),
        selectedSlot,
        deployedCount,
        canStart: deployedCount > 0,
    };
}

/**
 * 编队页绑定声明：布阵区格（`slot_{i}` + 选中态 `slot_selected_{i}`）与开始按钮；
 * 槽位循环覆盖全部布阵格（FORMATION_GRID_SIZE）。候选区渲染移交给 presenter
 * 的列表句柄（GList），不再走预置绑定。布阵格点击：未选中则选中、已选中且该格
 * 已上阵则卸下（spec：点击已上阵英雄卸下）。
 */
export function createLineupEditorBindings(commands: LineupEditorCommands): readonly Binding<LineupEditorViewModel>[] {
    const bindings: Binding<LineupEditorViewModel>[] = [
        {
            kind: "text",
            node: "txt_hud_status",
            get: (vm) => `${vm.canStart ? "SQUAD READY" : "SQUAD EMPTY"}  ${twoDigits(vm.deployedCount)}/${twoDigits(MAX_TEAM_SIZE)}`,
        },
        { kind: "enabled", node: "btn_start", get: (vm) => vm.canStart },
        { kind: "command", node: "btn_start", run: () => commands.startBattle() },
        {
            kind: "command",
            node: "btn_idle_rewards",
            run: () => commands.openIdleRewards(),
        },
    ];

    for (let slot = 0; slot < FORMATION_GRID_SIZE; slot += 1) {
        const slotAt = (vm: LineupEditorViewModel): LineupSlotView | undefined => vm.slots[slot];
        bindings.push(
            {
                kind: "text",
                node: `txt_slot_${slot}_name`,
                get: (vm) => slotAt(vm)?.heroName ?? "",
            },
            {
                kind: "visible",
                node: `slot_selected_${slot}`,
                get: (vm) => vm.selectedSlot === slot,
            },
            {
                kind: "command",
                node: `slot_${slot}`,
                run: (vm) => {
                    const slotView = slotAt(vm);
                    if (slotView === undefined) {
                        return;
                    }
                    if (vm.selectedSlot === slot) {
                        if (slotView.heroId !== null) {
                            commands.removeFromSlot(slot);
                        }
                        commands.selectSlot(null);
                        return;
                    }
                    commands.selectSlot(slot);
                },
            },
        );
    }

    return bindings;
}
