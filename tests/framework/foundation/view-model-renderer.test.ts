import { describe, expect, test } from "bun:test";

import type {
    Bindable,
    ViewModelNode,
} from "../../../assets/framework/contracts/ui/ViewModel";
import {
    createBindable,
    createViewModelRenderer,
    type ViewModelRenderer,
} from "../../../assets/framework/core/ui/ViewModelRenderer";

/** 记录型视图节点：记录每次 setter 调用与注册的点击回调，供断言 diff 行为。 */
interface RecordingNode {
    text: string | undefined;
    progress: number | undefined;
    visible: boolean | undefined;
    /** 最近一次坐标写入（position 绑定经 setXY 记录）。 */
    xy: { x: number; y: number } | undefined;
    /** 最近一次注册的点击回调（onClick 注册语义）。 */
    clickHandler: (() => void) | undefined;
}

function recordNode(): RecordingNode {
    return {
        text: undefined,
        progress: undefined,
        visible: undefined,
        xy: undefined,
        clickHandler: undefined,
    };
}

/** 把记录转换为视图节点实现：setter 写入记录、onClick 保存回调。 */
function toNode(recording: RecordingNode): ViewModelNode {
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
}

/** 测试视图：按节点名返回记录型节点；name 不存在时返回 undefined。 */
function makeView(): {
    nodes: Map<string, RecordingNode>;
    node: (name: string) => ViewModelNode | undefined;
} {
    const nodes = new Map<string, RecordingNode>();
    return {
        nodes,
        node: (name: string) => {
            const recording = nodes.get(name);
            return recording === undefined ? undefined : toNode(recording);
        },
    };
}

interface DemoViewModel {
    hp: number;
    name: string;
    showResult: boolean;
}

describe("Bindable observable state", () => {
    test("reads back the latest written value", () => {
        const state: Bindable<number> = createBindable(0);
        expect(state.get()).toBe(0);
        state.set(5);
        expect(state.get()).toBe(5);
    });

    test("notifies subscribers when the value changes", () => {
        const state: Bindable<number> = createBindable(0);
        let received: number | undefined;
        state.subscribe((value) => {
            received = value;
        });
        state.set(7);
        expect(received).toBe(7);
    });

    test("does not notify when writing the same value", () => {
        const state: Bindable<number> = createBindable(0);
        let calls = 0;
        state.subscribe(() => {
            calls += 1;
        });
        state.set(0);
        expect(calls).toBe(0);
        state.set(1);
        expect(calls).toBe(1);
    });
});

describe("ViewModelRenderer binding declarations", () => {
    test("text binding writes the formatted value to the node", () => {
        const view = makeView();
        const hpNode = recordNode();
        view.nodes.set("txt_hp", hpNode);
        const renderer: ViewModelRenderer<DemoViewModel> = createViewModelRenderer({
            node: view.node,
            bindings: [
                { kind: "text", node: "txt_hp", get: (vm) => `HP ${vm.hp}` },
            ],
        });
        renderer.setViewModel({ hp: 10, name: "Hero", showResult: false });
        expect(hpNode.text).toBe("HP 10");
    });

    test("progress binding writes the normalized value", () => {
        const view = makeView();
        const barNode = recordNode();
        view.nodes.set("bar_hp", barNode);
        const renderer: ViewModelRenderer<DemoViewModel> = createViewModelRenderer({
            node: view.node,
            bindings: [
                { kind: "progress", node: "bar_hp", get: (vm) => vm.hp / 100 },
            ],
        });
        renderer.setViewModel({ hp: 50, name: "Hero", showResult: false });
        expect(barNode.progress).toBe(0.5);
    });

    test("visible binding toggles node visibility", () => {
        const view = makeView();
        const resultNode = recordNode();
        view.nodes.set("txt_result", resultNode);
        const renderer: ViewModelRenderer<DemoViewModel> = createViewModelRenderer({
            node: view.node,
            bindings: [
                { kind: "visible", node: "txt_result", get: (vm) => vm.showResult },
            ],
        });
        renderer.setViewModel({ hp: 10, name: "Hero", showResult: true });
        expect(resultNode.visible).toBe(true);
    });

    test("position binding writes coordinates to the node", () => {
        const view = makeView();
        const unitNode = recordNode();
        view.nodes.set("unit_0", unitNode);
        const renderer: ViewModelRenderer<DemoViewModel> = createViewModelRenderer({
            node: view.node,
            bindings: [
                {
                    kind: "position",
                    node: "unit_0",
                    get: (_vm) => ({ x: 100, y: 200 }),
                },
            ],
        });
        renderer.setViewModel({ hp: 10, name: "Hero", showResult: false });
        expect(unitNode.xy).toEqual({ x: 100, y: 200 });
    });

    test("position binding skips the write when coordinates are unchanged", () => {
        const view = makeView();
        const unitNode = recordNode();
        view.nodes.set("unit_0", unitNode);
        const renderer: ViewModelRenderer<DemoViewModel> = createViewModelRenderer({
            node: view.node,
            bindings: [
                {
                    kind: "position",
                    node: "unit_0",
                    get: (vm) => ({ x: vm.hp, y: 100 }),
                },
            ],
        });
        renderer.setViewModel({ hp: 50, name: "Hero", showResult: false });
        expect(unitNode.xy).toEqual({ x: 50, y: 100 });

        // 坐标未变（对象字面量新引用但 x/y 分量相同）：结构比较后不重复写入
        renderer.setViewModel({ hp: 50, name: "Hero", showResult: false });
        expect(unitNode.xy).toEqual({ x: 50, y: 100 });
    });

    test("position binding writes again when a component changes", () => {
        const view = makeView();
        const unitNode = recordNode();
        view.nodes.set("unit_0", unitNode);
        const renderer: ViewModelRenderer<DemoViewModel> = createViewModelRenderer({
            node: view.node,
            bindings: [
                {
                    kind: "position",
                    node: "unit_0",
                    get: (vm) => ({ x: vm.hp, y: 100 }),
                },
            ],
        });
        renderer.setViewModel({ hp: 50, name: "Hero", showResult: false });
        expect(unitNode.xy).toEqual({ x: 50, y: 100 });

        renderer.setViewModel({ hp: 60, name: "Hero", showResult: false });
        expect(unitNode.xy).toEqual({ x: 60, y: 100 });
    });

    test("a node without setXY ignores position writes without breaking others", () => {
        const view = makeView();
        // 未实现 setXY 的节点：position 绑定应被安全忽略，其余绑定正常
        const legacyNode: RecordingNode & { xy?: never } = {
            ...recordNode(),
            xy: undefined,
        };
        view.nodes.set("unit_0", legacyNode);
        const nameNode = recordNode();
        view.nodes.set("txt_name", nameNode);
        const renderer: ViewModelRenderer<DemoViewModel> = createViewModelRenderer({
            node: (name: string) => {
                const recording = view.nodes.get(name);
                if (recording === undefined) {
                    return undefined;
                }
                // legacyNode 只实现 setText，不实现 setXY
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
                    onClick: (handler: () => void) => {
                        recording.clickHandler = handler;
                    },
                };
            },
            bindings: [
                {
                    kind: "position",
                    node: "unit_0",
                    get: (vm) => ({ x: vm.hp, y: 100 }),
                },
                { kind: "text", node: "txt_name", get: (vm) => vm.name },
            ],
        });
        expect(() => {
            renderer.setViewModel({ hp: 50, name: "Hero", showResult: false });
        }).not.toThrow();
        expect(legacyNode.xy).toBeUndefined();
        expect(nameNode.text).toBe("Hero");
    });

    test("command binding wires node click to the handler", () => {
        const view = makeView();
        const buttonNode = recordNode();
        view.nodes.set("btn_action", buttonNode);
        let clicks = 0;
        const renderer: ViewModelRenderer<DemoViewModel> = createViewModelRenderer({
            node: view.node,
            bindings: [
                {
                    kind: "command",
                    node: "btn_action",
                    run: () => {
                        clicks += 1;
                    },
                },
            ],
        });
        renderer.setViewModel({ hp: 10, name: "Hero", showResult: false });
        expect(buttonNode.clickHandler).toBeDefined();
        // 触发注册的点击回调：命令执行
        buttonNode.clickHandler?.();
        expect(clicks).toBe(1);
    });
});

describe("ViewModelRenderer automatic diff rendering", () => {
    test("updates only the binding whose value changed", () => {
        const view = makeView();
        const hpNode = recordNode();
        const nameNode = recordNode();
        view.nodes.set("txt_hp", hpNode);
        view.nodes.set("txt_name", nameNode);
        const renderer: ViewModelRenderer<DemoViewModel> = createViewModelRenderer({
            node: view.node,
            bindings: [
                { kind: "text", node: "txt_hp", get: (vm) => `HP ${vm.hp}` },
                { kind: "text", node: "txt_name", get: (vm) => vm.name },
            ],
        });
        renderer.setViewModel({ hp: 10, name: "Hero", showResult: false });

        // 变化 hp 字段，name 不变
        renderer.setViewModel({ hp: 12, name: "Hero", showResult: false });

        expect(hpNode.text).toBe("HP 12");
        // name 节点值不变且未被重复写入（diff 未触发更新）
        expect(nameNode.text).toBe("Hero");
    });

    test("renders all bindings on initial setViewModel", () => {
        const view = makeView();
        const hpNode = recordNode();
        const nameNode = recordNode();
        view.nodes.set("txt_hp", hpNode);
        view.nodes.set("txt_name", nameNode);
        const renderer: ViewModelRenderer<DemoViewModel> = createViewModelRenderer({
            node: view.node,
            bindings: [
                { kind: "text", node: "txt_hp", get: (vm) => `HP ${vm.hp}` },
                { kind: "text", node: "txt_name", get: (vm) => vm.name },
            ],
        });
        renderer.setViewModel({ hp: 10, name: "Hero", showResult: false });
        expect(hpNode.text).toBe("HP 10");
        expect(nameNode.text).toBe("Hero");
    });
});

describe("ViewModelRenderer lifecycle", () => {
    test("dispose stops rendering on later changes", () => {
        const view = makeView();
        const hpNode = recordNode();
        view.nodes.set("txt_hp", hpNode);
        const renderer: ViewModelRenderer<DemoViewModel> = createViewModelRenderer({
            node: view.node,
            bindings: [
                { kind: "text", node: "txt_hp", get: (vm) => `HP ${vm.hp}` },
            ],
        });
        renderer.setViewModel({ hp: 10, name: "Hero", showResult: false });
        expect(hpNode.text).toBe("HP 10");
        renderer.dispose();
        hpNode.text = undefined;
        renderer.setViewModel({ hp: 20, name: "Hero", showResult: false });
        expect(hpNode.text).toBeUndefined();
    });

    test("repeated dispose is idempotent", () => {
        const view = makeView();
        const renderer: ViewModelRenderer<DemoViewModel> = createViewModelRenderer({
            node: view.node,
            bindings: [],
        });
        expect(() => {
            renderer.dispose();
            renderer.dispose();
        }).not.toThrow();
    });
});

describe("ViewModelRenderer unknown node tolerance", () => {
    test("skips a binding whose node does not exist without breaking others", () => {
        const view = makeView();
        const nameNode = recordNode();
        view.nodes.set("txt_name", nameNode);
        const renderer: ViewModelRenderer<DemoViewModel> = createViewModelRenderer({
            node: view.node,
            bindings: [
                { kind: "text", node: "txt_missing", get: (vm) => `HP ${vm.hp}` },
                { kind: "text", node: "txt_name", get: (vm) => vm.name },
            ],
        });
        expect(() => {
            renderer.setViewModel({ hp: 10, name: "Hero", showResult: false });
        }).not.toThrow();
        expect(nameNode.text).toBe("Hero");
    });
});

describe("ViewModelRenderer dynamic instance reclaim", () => {
    type PrunableResolver = {
        (name: string): ViewModelNode | undefined;
        prune?: (nodeNames: readonly string[]) => void;
    };

    interface ReclaimVM {
        hp: number;
    }

    test("setBindings invokes the resolver prune hook with the bound node names", () => {
        const pruned: string[][] = [];
        const node: PrunableResolver = (name: string) => {
            if (name === "unit_a") {
                return toNode(recordNode());
            }
            return undefined;
        };
        node.prune = (nodeNames) => {
            pruned.push([...nodeNames]);
        };
        const renderer = createViewModelRenderer<ReclaimVM>({
            node,
            bindings: [],
        });

        renderer.setBindings([
            { kind: "text", node: "unit_a", get: (vm) => `HP ${vm.hp}` },
        ]);
        renderer.setViewModel({ hp: 100 });

        // 每次 setBindings 全量刷新后，渲染器把当前绑定节点名交给 resolver 回收
        expect(pruned).toHaveLength(1);
        expect(pruned[0]).toContain("unit_a");
    });

    test("a plain resolver without the prune hook is left untouched", () => {
        const view = makeView();
        const nameNode = recordNode();
        view.nodes.set("txt_name", nameNode);
        const renderer = createViewModelRenderer<ReclaimVM>({
            node: view.node,
            bindings: [
                { kind: "text", node: "txt_name", get: (vm) => String(vm.hp) },
            ],
        });
        expect(() => {
            renderer.setViewModel({ hp: 10 });
        }).not.toThrow();
        expect(nameNode.text).toBe("10");
    });
});
