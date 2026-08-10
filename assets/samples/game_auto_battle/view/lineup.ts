import type { Binding } from "../../../framework";
import { MAX_TEAM_SIZE } from "../logic/config";
import type { AutoBattleHero, AutoBattleLineup } from "../models";

/** 编队页候选区预置位数量（FGUI 预置候选槽位，运行时按英雄池填充）。 */
export const LINEUP_CANDIDATE_SLOTS = 6;

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

/** 编队页 ViewModel：候选英雄区 + 布阵区（定长 MAX_TEAM_SIZE 槽） + 选中格。 */
export interface LineupEditorViewModel {
    readonly candidates: readonly LineupCandidateView[];
    readonly slots: readonly LineupSlotView[];
    /** 当前选中的布阵格；null = 未选中。 */
    readonly selectedSlot: number | null;
}

/** 编队页命令：点击选择（D3），由调用方注入编辑/持久化/开战操作。 */
export interface LineupEditorCommands {
    /** 点击布阵格：未选中则选中；已选中则取消选中（供卸下经候选页再触发）。 */
    selectSlot(slot: number): void;
    /** 点击候选英雄：填入选中的布阵格，否则填入第一个空槽（英雄唯一性由 reducer 保证）。 */
    selectHero(heroId: string): void;
    /** 卸下指定槽位英雄（点击已上阵英雄二次触发）。 */
    removeFromSlot(slot: number): void;
    /** 以当前编队开始战斗（开战由 lineup 实例化）。 */
    startBattle(): void;
}

/** 编队页 VM 派生：候选区 = 英雄池（含上阵态），布阵区 = 定长槽（含选中格）。 */
export function createLineupEditorViewModel(
    heroes: readonly AutoBattleHero[],
    lineup: AutoBattleLineup,
    selectedSlot: number | null,
): LineupEditorViewModel {
    const deployed = new Set(
        lineup.slots.filter((heroId): heroId is string => heroId !== null),
    );

    return {
        candidates: heroes.map((hero) => ({
            heroId: hero.id,
            heroName: hero.name,
            deployed: deployed.has(hero.id),
        })),
        slots: lineup.slots.map((heroId, slot) => {
            const hero =
                heroId === null ? undefined : heroes.find((h) => h.id === heroId);
            return { slot, heroId, heroName: hero?.name ?? "" };
        }),
        selectedSlot,
    };
}

/**
 * 编队页绑定声明：候选区预置位（`candidate_{i}`）、布阵区格（`slot_{i}` +
 * 选中态 `slot_selected_{i}`）与开始按钮。布阵格点击：未选中则选中、已选中且
 * 该格已上阵则卸下（spec：点击已上阵英雄卸下）。
 */
export function createLineupEditorBindings(
    commands: LineupEditorCommands,
): readonly Binding<LineupEditorViewModel>[] {
    const bindings: Binding<LineupEditorViewModel>[] = [
        { kind: "command", node: "btn_start", run: () => commands.startBattle() },
    ];

    for (let index = 0; index < LINEUP_CANDIDATE_SLOTS; index += 1) {
        const candidateAt = (vm: LineupEditorViewModel): LineupCandidateView | undefined =>
            vm.candidates[index];
        bindings.push(
            {
                kind: "visible",
                node: `candidate_${index}`,
                get: (vm) => candidateAt(vm) !== undefined,
            },
            {
                kind: "text",
                node: `txt_candidate_${index}_name`,
                get: (vm) => candidateAt(vm)?.heroName ?? "",
            },
            {
                kind: "command",
                node: `candidate_${index}`,
                run: (vm) => {
                    const candidate = candidateAt(vm);
                    if (candidate !== undefined) {
                        commands.selectHero(candidate.heroId);
                    }
                },
            },
        );
    }

    for (let slot = 0; slot < MAX_TEAM_SIZE; slot += 1) {
        const slotAt = (vm: LineupEditorViewModel): LineupSlotView | undefined =>
            vm.slots[slot];
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
                        commands.selectSlot(-1);
                        return;
                    }
                    commands.selectSlot(slot);
                },
            },
        );
    }

    return bindings;
}
