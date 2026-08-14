import { describe, expect, test } from "bun:test";

import type { IViewModelNode } from "../../../assets/framework";
import { createAutoBattlePresenter } from "../../../assets/samples/game_auto_battle/view/presenter";
import { AUTO_BATTLE_ASSEMBLY_EXISTS, loadCreateAutoBattleFixture } from "../support/auto-battle-fixture";

/** 记录型视图节点：记录 setter 与点击回调。 */
interface RecordingNode {
    text: string | undefined;
    progress: number | undefined;
    visible: boolean | undefined;
    xy: { x: number; y: number } | undefined;
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
                progress: undefined,
                visible: undefined,
                xy: undefined,
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
                setProgress: (value: number) => {
                    recording.progress = value;
                },
                setVisible: (value: boolean) => {
                    recording.visible = value;
                },
                setXY: (x: number, y: number) => {
                    recording.xy = { x, y };
                },
                onClick: (handler: () => void) => {
                    recording.clickHandler = handler;
                },
            };
        },
    };
}

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

function battleContent(): Record<string, unknown> {
    return {
        heroes: ["a", "b", "e"].map((id) => hero(id, id)),
        lineups: { ally: ["a", "b"], enemy: ["e"] },
        energyGainAttacker: 10,
        energyGainTarget: 5,
    };
}

describe.skipIf(!AUTO_BATTLE_ASSEMBLY_EXISTS)("Auto-battle battle presenter", () => {
    test("renders static HUD and dynamic unit bindings", async () => {
        const createAutoBattleFixture = await loadCreateAutoBattleFixture();
        const fixture = createAutoBattleFixture({ configContent: battleContent() });
        await fixture.start();
        const view = recordingView();
        const presenter = createAutoBattlePresenter(fixture, view.node);

        expect(view.nodes.get("txt_round")?.text).toBe("第 1 回合");
        expect(view.nodes.get("btn_speed")?.text).toBe("x1");
        // 动态单位绑定：存活单位按 id 生成（节点名 unit_{id} 系列）
        expect(view.nodes.get("txt_unit_a_name")?.text).toBe("a");
        expect(view.nodes.get("txt_unit_b_name")?.text).toBe("b");
        expect(view.nodes.get("txt_unit_e_name")?.text).toBe("e");

        presenter.dispose();
        await fixture.dispose();
    });

    test("clicking the speed button cycles the speed and updates the text", async () => {
        const createAutoBattleFixture = await loadCreateAutoBattleFixture();
        const fixture = createAutoBattleFixture({ configContent: battleContent() });
        await fixture.start();
        const view = recordingView();
        const presenter = createAutoBattlePresenter(fixture, view.node);

        expect(view.nodes.get("btn_speed")?.text).toBe("x1");
        view.nodes.get("btn_speed")?.clickHandler?.();
        expect(fixture.getSpeed()).toBe(2);
        expect(view.nodes.get("btn_speed")?.text).toBe("x2");

        view.nodes.get("btn_speed")?.clickHandler?.();
        expect(fixture.getSpeed()).toBe(3);
        expect(view.nodes.get("btn_speed")?.text).toBe("x3");

        presenter.dispose();
        await fixture.dispose();
    });

    test("presenter runs VS phase before entrance and fighting (phases)", async () => {
        const createAutoBattleFixture = await loadCreateAutoBattleFixture();
        const fixture = createAutoBattleFixture({ configContent: battleContent() });
        await fixture.start();
        const view = recordingView();
        const presenter = createAutoBattlePresenter(fixture, view.node);

        // VS 阶段：VS 节点已写入队长名（每方 index 最小存活单位）
        // 注意 presenter 用内部 GameClock 驱动（interval 推进），此测试只验证初始渲染即进入 VS 阶段
        expect(view.nodes.get("vs_left")?.text).toBe("e"); // 敌方唯一单位 e
        expect(view.nodes.get("vs_right")?.text).toBe("a"); // 己方 index 0 → a
        expect(view.nodes.get("vs_badge")?.text).toBe("VS");

        presenter.dispose();
        await fixture.dispose();
    });
});
