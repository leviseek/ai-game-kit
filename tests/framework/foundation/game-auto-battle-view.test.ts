import { describe, expect, test } from "bun:test";
import { buildAutoBattleBindings, gridToXY, unitEffectAnchorXY, type AutoBattleUnitView, type AutoBattleViewModel } from "../../../assets/samples/game_auto_battle/view/view";
import { createViewModelRenderer, type IViewModelNode } from "../../../assets/framework";
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
    node: (name: string) => IViewModelNode | undefined;
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
function unit(id: string, side: "ally" | "enemy", index: number, gridKey = "0:0"): AutoBattleUnitView {
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
    test("all map cells keep the unit feet (hex center) inside the battle panel and the name/bars inside the container", () => {
        const PANEL_LEFT = 32;
        const PANEL_TOP = 108;
        const PANEL_RIGHT = 1248;
        const PANEL_BOTTOM = 508;
        const UNIT_WIDTH = 120;
        // 单位容器（container_units）尺寸
        const CONTAINER_WIDTH = 1280;
        const CONTAINER_HEIGHT = 500;

        for (let row = 0; row < 4; row += 1) {
            for (let col = 0; col < 11; col += 1) {
                const slot = gridToXY(`${row}:${col}`);
                // 脚底 = 六边形中心（UnitSlot loader 底边，vAlign="bottom"）
                const centerX = slot.x + 60;
                const centerY = slot.y + 236;
                // 六边形中心（单位脚底）落在战场面板内
                expect(centerX).toBeGreaterThanOrEqual(PANEL_LEFT + 70);
                expect(centerX).toBeLessThanOrEqual(PANEL_RIGHT - 70);
                expect(centerY).toBeGreaterThanOrEqual(PANEL_TOP + 40);
                expect(centerY).toBeLessThanOrEqual(PANEL_BOTTOM - 40);
                // 名称/血条（槽位局部 y96..136）仍在单位容器内；顶部格脚底靠上，
                // 槽顶可为负（UnitSlot 上半在容器外可见，仅校验文本/进度条落点）
                expect(slot.x).toBeGreaterThanOrEqual(0);
                expect(slot.x + UNIT_WIDTH).toBeLessThanOrEqual(CONTAINER_WIDTH);
                expect(slot.y + 96).toBeGreaterThanOrEqual(0);
                expect(slot.y + 136).toBeLessThanOrEqual(CONTAINER_HEIGHT);
            }
        }
    });

    test("enemy cells (left half) map left of ally cells", () => {
        const enemy = gridToXY("0:1");
        const ally = gridToXY("0:7");
        expect(enemy.x).toBeLessThan(ally.x);
        // 敌右 3 列（列 1-3）、己左 3 列（列 7-9）：敌列 3 仍在己列 7 左侧（中间空列 4-6）
        expect(gridToXY("0:3").x).toBeLessThan(gridToXY("0:7").x);
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

describe("Auto-battle semantic effect anchors", () => {
    const slot = { x: 400, y: 100 };

    test("heal aura centers on the feet slot", () => {
        expect(unitEffectAnchorXY(slot, "feet")).toEqual({ x: 390, y: 281 });
    });

    test("fireball targets upper body while physical impacts target torso", () => {
        expect(unitEffectAnchorXY(slot, "upper-body")).toEqual({ x: 390, y: 161 });
        expect(unitEffectAnchorXY(slot, "torso")).toEqual({ x: 390, y: 185 });
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
        const { view } = renderUnits([unit("a", "ally", 0, "0:3"), unit("e", "enemy", 0, "0:0")]);

        expect(view.nodes.get("txt_unit_a_name")?.text).toBe("a");
        expect(view.nodes.get("txt_unit_e_name")?.text).toBe("e");
        // 存活单位实例可见
        expect(view.nodes.get("unit_a")?.visible).toBe(true);
    });

    test("position binding maps each unit to its grid coordinates", () => {
        const { view } = renderUnits([unit("a", "ally", 0, "0:3"), unit("e", "enemy", 0, "0:0")]);

        expect(view.nodes.get("unit_a")?.xy).toEqual(gridToXY("0:3"));
        expect(view.nodes.get("unit_e")?.xy).toEqual(gridToXY("0:0"));
    });

    test("progress and text bindings reflect hp and energy for each unit", () => {
        const { view } = renderUnits([unit("a", "ally", 0, "0:3"), unit("e", "enemy", 0, "0:0")]);

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

        const first = vm([unit("a", "ally", 0, "0:3"), unit("e", "enemy", 0, "0:0")]);
        renderer.setBindings(buildAutoBattleBindings(commands, first));
        renderer.setViewModel(first);
        expect(view.nodes.get("txt_unit_a_hp")?.text).toBe("HP 100/100");

        // 单位 e 阵亡（hp 归零）：绑定集不再包含它的节点（存活单位实例随之回收）
        const second = vm([{ ...unit("a", "ally", 0, "0:3") }, { ...unit("e", "enemy", 0, "0:0"), hp: 0 }]);
        const secondBindings = buildAutoBattleBindings(commands, second);
        expect(secondBindings.some((b) => b.node.startsWith("unit_e"))).toBe(false);
        // 存活单位仍正常绑定
        expect(secondBindings.some((b) => b.node === "txt_unit_a_name")).toBe(true);

        renderer.setBindings(secondBindings);
        renderer.setViewModel(second);
        expect(view.nodes.get("txt_unit_a_hp")?.text).toBe("HP 100/100");
    });

    test("static bindings (round/log/result/speed) still apply alongside unit bindings", () => {
        const { view } = renderUnits([unit("a", "ally", 0, "0:3")]);

        expect(view.nodes.get("txt_round")?.text).toBe("第 1 回合");
        expect(view.nodes.get("btn_speed")?.text).toBe("x1");
        expect(view.nodes.get("txt_result")?.visible).toBe(false);
        expect(view.nodes.get("result_plate")?.visible).toBe(false);
    });

    test("result plate follows the battle result visibility", () => {
        const initial = vm([unit("a", "ally", 0, "0:3")]);
        const view = recordingView();
        const renderer = createViewModelRenderer<AutoBattleViewModel>({
            node: view.node,
            bindings: buildAutoBattleBindings(commands, initial),
        });
        renderer.setViewModel(initial);

        const finished = { ...initial, result: "win" as const };
        renderer.setBindings(buildAutoBattleBindings(commands, finished));
        renderer.setViewModel(finished);

        expect(view.nodes.get("txt_result")?.visible).toBe(true);
        expect(view.nodes.get("result_plate")?.visible).toBe(true);
    });

    test("rebinding the unit set does not re-register command callbacks", () => {
        // 渲染器命令注册按节点名去重：动态重建绑定集时，同一命令节点不重复
        // 注册 onClick（否则真实 Adapter 的追加监听会随每次 render 累积触发）
        let clickRegistrations = 0;
        const view = recordingView();
        const node = (name: string): IViewModelNode | undefined => {
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
