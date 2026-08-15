import { describe, expect, test } from "bun:test";

import { createViewModelRenderer, type IViewModelNode } from "../../../assets/framework";
import { createLineupEditorBindings, createLineupEditorViewModel, type LineupEditorCommands, type LineupEditorViewModel } from "../../../assets/samples/game_auto_battle/view/lineup";
import { FORMATION_GRID_SIZE } from "../../../assets/samples/game_auto_battle/logic/grid";
import type { AutoBattleHero, AutoBattleLineup } from "../../../assets/samples/game_auto_battle/models";

/** 记录型视图节点：记录 setter 与点击回调，供断言绑定行为。 */
interface RecordingNode {
    text: string | undefined;
    visible: boolean | undefined;
    enabled: boolean | undefined;
    clickHandler: (() => void) | undefined;
}

function recordingView(): {
    nodes: Map<string, RecordingNode>;
    node: (name: string) => IViewModelNode | undefined;
} {
    const nodes = new Map<string, RecordingNode>();
    const ensure = (name: string): RecordingNode => {
        let recording = nodes.get(name);
        if (recording === undefined) {
            recording = {
                text: undefined,
                visible: undefined,
                enabled: undefined,
                clickHandler: undefined,
            };
            nodes.set(name, recording);
        }
        return recording;
    };
    return {
        nodes,
        node: (name: string) => {
            const recording = ensure(name);
            return {
                setText: (value: string) => {
                    recording.text = value;
                },
                setProgress: () => {},
                setVisible: (value: boolean) => {
                    recording.visible = value;
                },
                setEnabled: (value: boolean) => {
                    recording.enabled = value;
                },
                onClick: (handler: () => void) => {
                    recording.clickHandler = handler;
                },
            };
        },
    };
}

/** 构造英雄池条目。 */
function hero(id: string, name: string): AutoBattleHero {
    return {
        id,
        name,
        position: "front",
        maxHp: 100,
        attack: 10,
        speed: 5,
        energyMax: 100,
        skill: { id: `${id}-s`, name: `${name} S`, kind: "damage", value: 40, energyCost: 100 },
    };
}

function lineup(slots: readonly (string | null)[]): AutoBattleLineup {
    return {
        slots: Array.from({ length: FORMATION_GRID_SIZE }, (_, i) => slots[i] ?? null),
    };
}

const HEROES: readonly AutoBattleHero[] = ["a", "b", "c"].map((id) => hero(id, id));

describe("Auto-battle lineup editor view model", () => {
    test("candidates mirror the hero pool with deployed flags", () => {
        const vm = createLineupEditorViewModel(HEROES, lineup(["a"]), null);

        expect(vm.candidates.map((c) => c.heroId)).toEqual(["a", "b", "c"]);
        expect(vm.candidates[0]?.deployed).toBe(true);
        expect(vm.candidates[1]?.deployed).toBe(false);
    });

    test("slots mirror the lineup with hero names", () => {
        const vm = createLineupEditorViewModel(HEROES, lineup(["a", null, "c"]), null);

        expect(vm.slots[0]?.heroName).toBe("a");
        expect(vm.slots[0]?.heroId).toBe("a");
        expect(vm.slots[1]?.heroName).toBe("");
        expect(vm.slots[1]?.heroId).toBeNull();
        expect(vm.slots[2]?.heroName).toBe("c");
    });

    test("selected slot is reflected on the view model", () => {
        const vm = createLineupEditorViewModel(HEROES, lineup(["a"]), 2);
        expect(vm.selectedSlot).toBe(2);
    });

    test("derives deployed count and start availability from occupied slots", () => {
        const populated = createLineupEditorViewModel(HEROES, lineup(["a", null, "c"]), null);
        expect(populated.deployedCount).toBe(2);
        expect(populated.canStart).toBe(true);

        const empty = createLineupEditorViewModel(HEROES, lineup([]), null);
        expect(empty.deployedCount).toBe(0);
        expect(empty.canStart).toBe(false);
    });
});

describe("Auto-battle lineup editor bindings", () => {
    function render(
        commands: LineupEditorCommands,
        vm: LineupEditorViewModel,
    ): {
        view: ReturnType<typeof recordingView>;
    } {
        const view = recordingView();
        const renderer = createViewModelRenderer<LineupEditorViewModel>({
            node: view.node,
            bindings: createLineupEditorBindings(commands),
        });
        renderer.setViewModel(vm);
        return { view };
    }

    test("slot bindings cover the full formation size (11 slots 4-3-4)", () => {
        const calls: string[] = [];
        const heroes: readonly AutoBattleHero[] = Array.from({ length: 11 }, (_, i) => hero(`h${i}`, `H${i}`));
        const vm = createLineupEditorViewModel(heroes, lineup(["h0", null, "h2", "h3", null, "h5", "h6", null, "h8", null, "h10"]), null);
        const view = recordingView();
        const renderer = createViewModelRenderer<LineupEditorViewModel>({
            node: view.node,
            bindings: createLineupEditorBindings({
                selectSlot: (s) => calls.push(`slot:${s}`),
                selectHero: () => {},
                removeFromSlot: (s) => calls.push(`remove:${s}`),
                startBattle: () => {},
            }),
        });
        renderer.setViewModel(vm);

        expect(view.nodes.get("txt_slot_0_name")?.text).toBe("H0");
        expect(view.nodes.get("txt_slot_6_name")?.text).toBe("H6");
        expect(view.nodes.get("txt_slot_8_name")?.text).toBe("H8");
        expect(view.nodes.get("txt_slot_10_name")?.text).toBe("H10");
        expect(view.nodes.get("slot_10")?.clickHandler).toBeDefined();
    });

    test("clicking an unselected slot selects it; clicking again removes the hero", () => {
        const calls: string[] = [];
        const vm = createLineupEditorViewModel(HEROES, lineup(["a"]), null);
        const { view } = render(
            {
                selectSlot: (s) => calls.push(`slot:${s}`),
                selectHero: () => {},
                removeFromSlot: (s) => calls.push(`remove:${s}`),
                startBattle: () => {},
            },
            vm,
        );

        view.nodes.get("slot_0")?.clickHandler?.();
        expect(calls).toEqual(["slot:0"]);

        // 再次点击已选中的已上阵格：卸下并取消选中
        const selected = createLineupEditorViewModel(HEROES, lineup(["a"]), 0);
        const second = recordingView();
        const renderer = createViewModelRenderer<LineupEditorViewModel>({
            node: second.node,
            bindings: createLineupEditorBindings({
                selectSlot: (s) => calls.push(`slot:${s}`),
                selectHero: () => {},
                removeFromSlot: (s) => calls.push(`remove:${s}`),
                startBattle: () => {},
            }),
        });
        renderer.setViewModel(selected);
        second.nodes.get("slot_0")?.clickHandler?.();
        expect(calls).toEqual(["slot:0", "remove:0", "slot:null"]);
    });

    test("clicking an already selected empty slot just clears the selection", () => {
        const calls: string[] = [];
        const vm = createLineupEditorViewModel(HEROES, lineup([]), 0);
        const { view } = render(
            {
                selectSlot: (s) => calls.push(`slot:${s}`),
                selectHero: () => {},
                removeFromSlot: (s) => calls.push(`remove:${s}`),
                startBattle: () => {},
            },
            vm,
        );

        view.nodes.get("slot_0")?.clickHandler?.();
        expect(calls).toEqual(["slot:null"]);
    });

    test("selected slot visibility and start button command", () => {
        const calls: string[] = [];
        const vm = createLineupEditorViewModel(HEROES, lineup(["a"]), 1);
        const { view } = render(
            {
                selectSlot: () => {},
                selectHero: () => {},
                removeFromSlot: () => {},
                startBattle: () => calls.push("start"),
            },
            vm,
        );

        expect(view.nodes.get("slot_selected_0")?.visible).toBe(false);
        expect(view.nodes.get("slot_selected_1")?.visible).toBe(true);
        view.nodes.get("btn_start")?.clickHandler?.();
        expect(calls).toEqual(["start"]);
    });

    test("status text and start enabled state follow the deployed count", () => {
        const commands: LineupEditorCommands = {
            selectSlot: () => {},
            selectHero: () => {},
            removeFromSlot: () => {},
            startBattle: () => {},
        };

        const populated = render(commands, createLineupEditorViewModel(HEROES, lineup(["a", null, "c"]), null));
        expect(populated.view.nodes.get("txt_hud_status")?.text).toBe("SQUAD READY  02/06");
        expect(populated.view.nodes.get("btn_start")?.enabled).toBe(true);

        const empty = render(commands, createLineupEditorViewModel(HEROES, lineup([]), null));
        expect(empty.view.nodes.get("txt_hud_status")?.text).toBe("SQUAD EMPTY  00/06");
        expect(empty.view.nodes.get("btn_start")?.enabled).toBe(false);
    });
});
