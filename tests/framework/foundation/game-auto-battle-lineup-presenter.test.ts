import { describe, expect, test } from "bun:test";

import type { ViewModelNode } from "../../../assets/framework";
import type { FairyGuiListHandle } from "../../../assets/framework";
import { createLineupEditorPresenter } from "../../../assets/samples/game_auto_battle/view/lineup-presenter";
import {
    AUTO_BATTLE_ASSEMBLY_EXISTS,
    loadCreateAutoBattleFixture,
} from "../support/auto-battle-fixture";

/** 记录型视图节点：记录 setter 与点击回调。 */
interface RecordingNode {
    text: string | undefined;
    visible: boolean | undefined;
    clickHandler: (() => void) | undefined;
}

function recordingView(): {
    nodes: Map<string, RecordingNode>;
    node: (name: string) => ViewModelNode | undefined;
} {
    const nodes = new Map<string, RecordingNode>();
    const ensure = (name: string): RecordingNode => {
        let recording = nodes.get(name);
        if (recording === undefined) {
            recording = {
                text: undefined,
                visible: undefined,
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
                onClick: (handler: () => void) => {
                    recording.clickHandler = handler;
                },
            };
        },
    };
}

/** 记录型候选列表句柄：保存 itemClick 回调供测试触发（模拟 GList 项点击）。 */
function recordingListHandle(): {
    itemClick: ((index: number, item: { heroId: string; deployed: boolean }) => void) | undefined;
    list: (name: string) => FairyGuiListHandle<unknown> | undefined;
} {
    const state: {
        itemClick: ((index: number, item: { heroId: string; deployed: boolean }) => void) | undefined;
    } = {
        itemClick: undefined,
    };
    const handle: FairyGuiListHandle<unknown> = {
        setItems: () => {},
        setItemRenderer: () => {},
        setItemClick: (handler) => {
            state.itemClick =
                handler as (index: number, item: { heroId: string; deployed: boolean }) => void;
        },
    };
    return {
        get itemClick() {
            return state.itemClick;
        },
        list: (name: string) => (name === "candidate_list" ? handle : undefined),
    };
}

/** 编队场景配置：池含 a..e，初始己方 [a,b]、敌方 [e]，候选 = 池中非敌方。 */
function hero(id: string, name: string): Record<string, unknown> {
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

function lineupContent(): Record<string, unknown> {
    return {
        heroes: ["a", "b", "c", "d", "e"].map((id) => hero(id, id)),
        lineups: { ally: ["a", "b"], enemy: ["e"] },
        energyGainAttacker: 10,
        energyGainTarget: 5,
    };
}

describe.skipIf(!AUTO_BATTLE_ASSEMBLY_EXISTS)(
    "Auto-battle lineup editor presenter",
    () => {
        test("candidates are rendered through the list handle", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: lineupContent(),
            });
            await fixture.start();
            const view = recordingView();
            // 记录型列表解析器：捕获 candidate_list 句柄的 setItems 调用
            const listCalls: {
                items: readonly { heroId: string; deployed: boolean }[];
            }[] = [];
            const candidateList = {
                setItems: (items: readonly { heroId: string; deployed: boolean }[]) => {
                    listCalls.push({ items });
                },
                setItemRenderer: () => {},
                setItemClick: () => {},
            };
            const list = (name: string) =>
                name === "candidate_list" ? candidateList : undefined;
            const presenter = createLineupEditorPresenter(fixture, view.node, undefined, list);

            // 候选 = 池中非敌方 [a,b,c,d]；e 是敌方固定阵容，不出现
            expect(listCalls[0]?.items.map((c) => c.heroId)).toEqual(["a", "b", "c", "d"]);
            // 初始己方 [a,b] 已上阵
            expect(listCalls[0]?.items.find((c) => c.heroId === "a")?.deployed).toBe(true);
            expect(listCalls[0]?.items.find((c) => c.heroId === "d")?.deployed).toBe(false);

            presenter.dispose();
            await fixture.dispose();
        });

        test("renders deployed lineup slots", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: lineupContent(),
            });
            await fixture.start();
            const view = recordingView();
            const presenter = createLineupEditorPresenter(fixture, view.node);

            // 布阵区显示已上阵英雄
            expect(view.nodes.get("txt_slot_0_name")?.text).toBe("a");
            expect(view.nodes.get("txt_slot_1_name")?.text).toBe("b");
            expect(view.nodes.get("txt_slot_2_name")?.text).toBe("");

            presenter.dispose();
            await fixture.dispose();
        });

        test("clicking a candidate deploys it into the lineup and re-renders", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: lineupContent(),
            });
            await fixture.start();
            const view = recordingView();
            const candidateList = recordingListHandle();
            const presenter = createLineupEditorPresenter(
                fixture,
                view.node,
                undefined,
                candidateList.list,
            );

            candidateList.itemClick?.(2, { heroId: "c", deployed: false }); // 选择 c → 第一个空槽
            expect(fixture.lineup.value.slots[2]).toBe("c");
            expect(view.nodes.get("txt_slot_2_name")?.text).toBe("c");

            presenter.dispose();
            await fixture.dispose();
        });

        test("clicking an occupied slot twice removes the hero", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: lineupContent(),
            });
            await fixture.start();
            const view = recordingView();
            const presenter = createLineupEditorPresenter(fixture, view.node);

            view.nodes.get("slot_0")?.clickHandler?.(); // 选中 slot 0
            expect(fixture.lineup.selectedSlot).toBe(0);
            view.nodes.get("slot_0")?.clickHandler?.(); // 二次点击 → 卸下
            expect(fixture.lineup.value.slots[0]).toBeNull();
            expect(fixture.lineup.selectedSlot).toBeNull();

            presenter.dispose();
            await fixture.dispose();
        });

        test("clicking start battle reopens the battle with the current lineup", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: lineupContent(),
            });
            await fixture.start();
            const view = recordingView();
            const candidateList = recordingListHandle();
            const presenter = createLineupEditorPresenter(
                fixture,
                view.node,
                undefined,
                candidateList.list,
            );

            candidateList.itemClick?.(2, { heroId: "c", deployed: false }); // 上阵 c
            view.nodes.get("btn_start")?.clickHandler?.();

            const allyIds = fixture.battle.state.units
                .filter((u) => u.side === "ally")
                .map((u) => u.id);
            expect(allyIds).toEqual(["a", "b", "c"]);

            presenter.dispose();
            await fixture.dispose();
        });
    },
);
