import { describe, expect, test } from "bun:test";
import {
    createAutoBattleBindings,
    slotToXY,
    type AutoBattleUnitView,
} from "../../../assets/samples/game_auto_battle/view/view";
import { createViewModelRenderer, type ViewModelNode } from "../../../assets/framework";
/** 记录型视图节点：记录 setter 调用，供断言绑定 diff 行为。 */
interface RecordingNode {
    text: string | undefined;
    progress: number | undefined;
    visible: boolean | undefined;
    xy: { x: number; y: number } | undefined;
}
/** 记录型 VM 绑定视图：为每个绑定目标惰性建记录节点，节点解析恒返回实现。 */
function recordingView(): {
    nodes: Map<string, RecordingNode>;
    node: (name: string) => ViewModelNode | undefined;
} {
    const nodes = new Map<string, RecordingNode>();
    const ensure = (name: string): RecordingNode => {
        let recording = nodes.get(name);
        if (recording === undefined) {
            recording = { text: undefined, progress: undefined, visible: undefined, xy: undefined };
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
                onClick: () => {},
            };
        },
    };
}
/** 构造 N 个指定阵营单位（id/side/index 齐全，供 VM 消费）。 */
function unit(id: string, side: "ally" | "enemy", index: number): AutoBattleUnitView {
    return {
        id,
        name: id,
        side,
        index,
        hp: 100,
        hpMax: 100,
        energy: 0,
        energyMax: 100,
    };
}
/** 基础 VM：单位清单 + 无关字段（round/log/result/speed）。 */
function vm(units: readonly AutoBattleUnitView[]): {
    readonly round: number;
    readonly units: readonly AutoBattleUnitView[];
    readonly log: readonly string[];
    readonly result: "win" | "lose" | undefined;
    readonly speed: 1;
} {
    return { round: 1, units, log: [], result: undefined, speed: 1 };
}
describe("Auto-battle slotToXY mapping table", () => {
    test("ally is right and enemy is left for both 3v3 and 6v6", () => {
        // 3v3：己方右侧、敌方左侧
        const ally3 = slotToXY("ally", 0, 3);
        const enemy3 = slotToXY("enemy", 0, 3);
        expect(ally3.x).toBeGreaterThan(enemy3.x);
        expect(enemy3.x).toBeLessThan(ally3.x);
        // 6v6：同样敌左、己右
        const ally6 = slotToXY("ally", 0, 6);
        const enemy6 = slotToXY("enemy", 0, 6);
        expect(ally6.x).toBeGreaterThan(enemy6.x);
        expect(enemy6.x).toBeLessThan(ally6.x);
    });
    test("y is derived from slotIndex within the team band", () => {
        const ally0 = slotToXY("ally", 0, 6);
        const ally1 = slotToXY("ally", 1, 6);
        expect(ally1.y).toBeGreaterThan(ally0.y);
    });
    test("coordinates are stable within the max team size", () => {
        // 同一 side/slotIndex 输入产生确定性输出（纯函数无随机/可变状态）
        expect(slotToXY("enemy", 2, 6)).toEqual(slotToXY("enemy", 2, 6));
        expect(slotToXY("ally", 5, 6)).toEqual(slotToXY("ally", 5, 6));
    });
});
describe("Auto-battle dynamic slot bindings", () => {
    test("bindings pre-allocate MAX_TEAM_SIZE slots per side with global indices", () => {
        const view = recordingView();
        const renderer = createViewModelRenderer({
            node: view.node,
            bindings: createAutoBattleBindings({ restart: () => {}, cycleSpeed: () => {} }),
        });
        // 1v1 只上阵两个单位
        const units = [unit("a", "ally", 0), unit("e", "enemy", 0)];
        renderer.setViewModel(vm(units));
        // 己方 slot 0 → 全局索引 0，敌方 slot 0 → 全局索引 MAX_TEAM_SIZE(6)
        expect(view.nodes.get("txt_unit_0_name")?.text).toBe("a");
        expect(view.nodes.get("txt_unit_6_name")?.text).toBe("e");
        // 未上阵槽位节点保持空文本
        expect(view.nodes.get("txt_unit_1_name")?.text).toBe("");
    });
    test("position binding maps the unit group to slotToXY coordinates", () => {
        const view = recordingView();
        const renderer = createViewModelRenderer({
            node: view.node,
            bindings: createAutoBattleBindings({ restart: () => {}, cycleSpeed: () => {} }),
        });
        const units = [unit("a", "ally", 0), unit("e", "enemy", 0)];
        renderer.setViewModel(vm(units));
        // 单位组 unit_{全局索引} 被写到 slotToXY 坐标
        expect(view.nodes.get("unit_0")?.xy).toEqual(slotToXY("ally", 0, 1));
        expect(view.nodes.get("unit_6")?.xy).toEqual(slotToXY("enemy", 0, 1));
    });
    test("visible binding hides out-of-scale slots and keeps bound slots visible", () => {
        const view = recordingView();
        const renderer = createViewModelRenderer({
            node: view.node,
            bindings: createAutoBattleBindings({ restart: () => {}, cycleSpeed: () => {} }),
        });
        // 3v3：只上阵 6 单位，超出规模的预置槽位（如全局 9..11）隐藏
        const units = [
            unit("a0", "ally", 0),
            unit("a1", "ally", 1),
            unit("a2", "ally", 2),
            unit("e0", "enemy", 0),
            unit("e1", "enemy", 1),
            unit("e2", "enemy", 2),
        ];
        renderer.setViewModel(vm(units));
        expect(view.nodes.get("unit_0")?.visible).toBe(true);
        expect(view.nodes.get("unit_6")?.visible).toBe(true);
        expect(view.nodes.get("unit_9")?.visible).toBe(false);
        expect(view.nodes.get("unit_11")?.visible).toBe(false);
    });
    test("VM scale change diff rewrites affected slots", () => {
        const view = recordingView();
        const renderer = createViewModelRenderer({
            node: view.node,
            bindings: createAutoBattleBindings({ restart: () => {}, cycleSpeed: () => {} }),
        });
        // 1v1 → 6v6：规模变化后各槽位文本/显隐/坐标随之更新
        const one = [unit("a0", "ally", 0), unit("e0", "enemy", 0)];
        renderer.setViewModel(vm(one));
        expect(view.nodes.get("unit_6")?.visible).toBe(true);
        expect(view.nodes.get("unit_7")?.visible).toBe(false);
        const six = [
            unit("a0", "ally", 0),
            unit("a1", "ally", 1),
            unit("a2", "ally", 2),
            unit("a3", "ally", 3),
            unit("a4", "ally", 4),
            unit("a5", "ally", 5),
            unit("e0", "enemy", 0),
            unit("e1", "enemy", 1),
            unit("e2", "enemy", 2),
            unit("e3", "enemy", 3),
            unit("e4", "enemy", 4),
            unit("e5", "enemy", 5),
        ];
        renderer.setViewModel(vm(six));
        expect(view.nodes.get("unit_7")?.visible).toBe(true);
        expect(view.nodes.get("unit_11")?.visible).toBe(true);
        expect(view.nodes.get("txt_unit_7_name")?.text).toBe("e1");
    });
});
