import { describe, expect, test } from "bun:test";
import {
    buildAutoBattleBindings,
    gridToXY,
    type AutoBattleUnitView,
    type AutoBattleViewModel,
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
/** 构造指定阵营单位（id/side/index/gridKey 齐全，供 VM 消费）。 */
function unit(
    id: string,
    side: "ally" | "enemy",
    index: number,
    gridKey = "0:0",
): AutoBattleUnitView {
    return {
        id,
        name: id,
        side,
        index,
        gridKey,
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
describe("Auto-battle gridToXY mapping table", () => {
    test("enemy cells (left half) map left of ally cells", () => {
        const enemy = gridToXY("0:0");
        const ally = gridToXY("0:3");
        expect(enemy.x).toBeLessThan(ally.x);
        // 敌左 3 列、己右 3 列：敌列 2 仍在己列 3 左侧
        expect(gridToXY("0:2").x).toBeLessThan(gridToXY("0:3").x);
    });

    test("row increases y and col increases x within a side", () => {
        expect(gridToXY("1:0").y).toBeGreaterThan(gridToXY("0:0").y);
        expect(gridToXY("0:1").x).toBeGreaterThan(gridToXY("0:0").x);
        expect(gridToXY("0:4").x).toBeGreaterThan(gridToXY("0:3").x);
    });

    test("coordinates are deterministic for the same grid key", () => {
        expect(gridToXY("2:5")).toEqual(gridToXY("2:5"));
    });

    test("an invalid grid key is rejected", () => {
        expect(() => gridToXY("abc")).toThrow();
        expect(() => gridToXY("-1:0")).toThrow();
    });
});
describe("Auto-battle dynamic unit bindings", () => {
    const commands = { restart: () => {}, cycleSpeed: () => {} };

    /** 模拟渲染流程：初始空绑定集，render 时按存活单位重建绑定集并 setViewModel。 */
    function renderUnits(units: readonly AutoBattleUnitView[]): {
        view: ReturnType<typeof recordingView>;
        renderer: ReturnType<typeof createViewModelRenderer<AutoBattleViewModel>>;
    } {
        const view = recordingView();
        const renderer = createViewModelRenderer<AutoBattleViewModel>({
            node: view.node,
            bindings: [],
        });
        const vmValue = vm(units);
        renderer.setBindings(buildAutoBattleBindings(commands, vmValue));
        renderer.setViewModel(vmValue);
        return { view, renderer };
    }

    test("bindings are generated per surviving unit by id", () => {
        const { view } = renderUnits([
            unit("a", "ally", 0, "0:3"),
            unit("e", "enemy", 0, "0:0"),
        ]);

        expect(view.nodes.get("txt_unit_a_name")?.text).toBe("a");
        expect(view.nodes.get("txt_unit_e_name")?.text).toBe("e");
        // 存活单位实例可见
        expect(view.nodes.get("unit_a")?.visible).toBe(true);
    });

    test("position binding maps each unit to its grid coordinates", () => {
        const { view } = renderUnits([
            unit("a", "ally", 0, "0:3"),
            unit("e", "enemy", 0, "0:0"),
        ]);

        expect(view.nodes.get("unit_a")?.xy).toEqual(gridToXY("0:3"));
        expect(view.nodes.get("unit_e")?.xy).toEqual(gridToXY("0:0"));
    });

    test("progress and text bindings reflect hp and energy for each unit", () => {
        const { view } = renderUnits([
            unit("a", "ally", 0, "0:3"),
            unit("e", "enemy", 0, "0:0"),
        ]);

        expect(view.nodes.get("txt_unit_a_hp")?.text).toBe("HP 100/100");
        expect(view.nodes.get("bar_unit_a_hp")?.progress).toBe(1);
        expect(view.nodes.get("bar_unit_a_energy")?.progress).toBe(0);
        expect(view.nodes.get("bar_unit_e_hp")?.progress).toBe(1);
    });

    test("re-rendering with a changed unit set rebinds the surviving units", () => {
        const view = recordingView();
        const renderer = createViewModelRenderer<AutoBattleViewModel>({
            node: view.node,
            bindings: [],
        });

        const first = vm([
            unit("a", "ally", 0, "0:3"),
            unit("e", "enemy", 0, "0:0"),
        ]);
        renderer.setBindings(buildAutoBattleBindings(commands, first));
        renderer.setViewModel(first);
        expect(view.nodes.get("txt_unit_a_hp")?.text).toBe("HP 100/100");

        // 单位 e 阵亡（从 VM 移除）：重新渲染只保留存活单位绑定
        const second = vm([unit("a", "ally", 0, "0:3")]);
        renderer.setBindings(buildAutoBattleBindings(commands, second));
        renderer.setViewModel(second);
        expect(view.nodes.get("txt_unit_a_hp")?.text).toBe("HP 100/100");
    });

    test("static bindings (round/log/result/speed) still apply alongside unit bindings", () => {
        const { view } = renderUnits([unit("a", "ally", 0, "0:3")]);

        expect(view.nodes.get("txt_round")?.text).toBe("第 1 回合");
        expect(view.nodes.get("btn_speed")?.text).toBe("x1");
        expect(view.nodes.get("txt_result")?.visible).toBe(false);
    });

    test("rebinding the unit set does not re-register command callbacks", () => {
        // 渲染器命令注册按节点名去重：动态重建绑定集时，同一命令节点不重复
        // 注册 onClick（否则真实 Adapter 的追加监听会随每次 render 累积触发）
        let clickRegistrations = 0;
        const view = recordingView();
        const node = (name: string): ViewModelNode | undefined => {
            const resolved = view.node(name);
            if (resolved === undefined) {
                return undefined;
            }
            const originalOnClick = resolved.onClick.bind(resolved);
            return {
                ...resolved,
                onClick: (handler: () => void) => {
                    clickRegistrations += 1;
                    originalOnClick(handler);
                },
            };
        };
        const renderer = createViewModelRenderer<AutoBattleViewModel>({
            node,
            bindings: [],
        });
        const commands = { restart: () => {}, cycleSpeed: () => {} };
        const units = [unit("a", "ally", 0, "0:3")];

        renderer.setBindings(buildAutoBattleBindings(commands, vm(units)));
        renderer.setViewModel(vm(units));
        renderer.setBindings(buildAutoBattleBindings(commands, vm(units)));
        renderer.setViewModel(vm(units));

        // 两次重建绑定集：btn_restart / btn_speed 各只注册一次 onClick
        expect(clickRegistrations).toBe(2);
    });
});
