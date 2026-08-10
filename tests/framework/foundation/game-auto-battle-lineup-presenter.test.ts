import { describe, expect, test } from "bun:test";

import type { ViewModelNode } from "../../../assets/framework";
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
        test("renders candidates (excluding enemy lineup) and deployed slots", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: lineupContent(),
            });
            await fixture.start();
            const view = recordingView();
            const presenter = createLineupEditorPresenter(fixture, view.node);

            // 候选 = 池中非敌方 [a,b,c,d]；e 是敌方固定阵容，不出现
            expect(view.nodes.get("txt_candidate_0_name")?.text).toBe("a");
            expect(view.nodes.get("txt_candidate_1_name")?.text).toBe("b");
            expect(view.nodes.get("txt_candidate_2_name")?.text).toBe("c");
            expect(view.nodes.get("txt_candidate_3_name")?.text).toBe("d");
            // 池英雄不足 6 时剩余候选位隐藏
            expect(view.nodes.get("candidate_4")?.visible).toBe(false);
            expect(view.nodes.get("candidate_5")?.visible).toBe(false);

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
            const presenter = createLineupEditorPresenter(fixture, view.node);

            view.nodes.get("candidate_2")?.clickHandler?.(); // 选择 c → 第一个空槽
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
            const presenter = createLineupEditorPresenter(fixture, view.node);

            view.nodes.get("candidate_2")?.clickHandler?.(); // 上阵 c
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
