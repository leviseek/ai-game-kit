import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

import { createFairyGuiMock } from "./helpers/fairygui-mock";

import { UiAutoBattleUnitHitFeedbackCom } from "../../../assets/ui/generated/ui-autobattle";
import { UiCommonUnitSlot } from "../../../assets/ui/generated/ui-common";

// 实现值 import fairygui-cc；统一使用共享 fixture 避免全量运行解析失败
mock.module("fairygui-cc", () => createFairyGuiMock());

/** 战场单位节点映射：`unit_{id}` 系列运行时实例化 UnitSlot（复用 samples 的契约形状）。 */
const unitMapping = {
    containerName: "container_units",
    componentUrl: UiCommonUnitSlot,
    parse: (name: string) => {
        for (const [pattern, field] of [
            [/^unit_(.+)$/, null],
            [/^txt_unit_(.+)_name$/, "txt_name"],
            [/^txt_unit_(.+)_hp$/, "txt_hp"],
            [/^bar_unit_(.+)_hp$/, "bar_hp"],
            [/^bar_unit_(.+)_energy$/, "bar_energy"],
        ] as const) {
            const match = pattern.exec(name);
            if (match !== null) {
                return { id: match[1]!, field };
            }
        }
        return undefined;
    },
};

/** 动态实例句柄实现路径（mock 后动态加载，避免静态 import 在 mock 前解析）。 */
const HANDLE_FILE = resolve(
    import.meta.dir,
    "../../../assets/framework/adapters/cocos/ui/DynamicComponentViewHandle.ts",
);

async function loadHandle(): Promise<{
    createDynamicComponentViewHandle: typeof import("../../../assets/framework/adapters/cocos/ui/DynamicComponentViewHandle")["createDynamicComponentViewHandle"];
}> {
    return (await import(pathToFileURL(HANDLE_FILE).href)) as never;
}

/** 构造页面 mock：根 + 动态实例容器（容器具备 addChild/removeChild/children）。 */
function makeView(): {
    view: {
        name: string;
        getChild(name: string): unknown;
        children: unknown[];
    };
    container: { name: string; children: unknown[]; addChild(c: unknown): unknown; removeChild(c: unknown, dispose?: boolean): unknown };
} {
    const container = {
        name: "container_units",
        children: [] as unknown[],
        addChild(child: unknown) {
            this.children.push(child);
            return child;
        },
        removeChild(child: unknown) {
            const index = this.children.indexOf(child);
            if (index >= 0) this.children.splice(index, 1);
            return child;
        },
        getChild() {
            return null;
        },
    };
    const view = {
        name: "AutoBattleView",
        children: [container] as unknown[],
        getChild(name: string) {
            return this.children.find((c) => (c as { name?: string })?.name === name) ?? null;
        },
    };
    return { view, container };
}

describe("DynamicComponentViewHandle instance lifecycle", () => {
    test("lazily creates an instance for a dynamic node and reuses it by id", async () => {
        const { createDynamicComponentViewHandle } = await loadHandle();
        const { view, container } = makeView();
        const resolver = createDynamicComponentViewHandle(
            view as never,
            unitMapping as never,
        );

        const nameNode = resolver("txt_unit_a_name");
        const hpNode = resolver("bar_unit_a_hp");

        // 同一 id（a）只创建一个实例
        expect(container.children).toHaveLength(1);
        expect(nameNode).toBeDefined();
        expect(hpNode).toBeDefined();
    });

    test("prune destroys instances whose id is no longer bound", async () => {
        const { createDynamicComponentViewHandle } = await loadHandle();
        const { view, container } = makeView();
        const resolver = createDynamicComponentViewHandle(
            view as never,
            unitMapping as never,
        );

        resolver("unit_a");
        resolver("unit_b");
        expect(container.children).toHaveLength(2);

        // 绑定集只剩 a（含其子字段）：b 的实例被回收，a 保留
        resolver.prune(["unit_a", "txt_unit_a_name", "bar_unit_a_hp"]);
        expect(container.children).toHaveLength(1);

        // a 也从绑定集消失：无活跃 id，实例全部回收
        resolver.prune([]);
        expect(container.children).toHaveLength(0);
    });

    test("prune keeps instances that are re-bound after being created", async () => {
        const { createDynamicComponentViewHandle } = await loadHandle();
        const { view, container } = makeView();
        const resolver = createDynamicComponentViewHandle(
            view as never,
            unitMapping as never,
        );

        resolver("unit_a");
        resolver.prune(["unit_a"]);
        expect(container.children).toHaveLength(1);

        // 复用：再次访问仍命中同一实例，不重复创建
        resolver("txt_unit_a_hp");
        expect(container.children).toHaveLength(1);
    });
});

describe("DynamicComponentViewHandle multiple mappings", () => {
    /** 命中反馈映射：FX 节点实例化到独立容器；活跃 id 从 unit_* 绑定节点推导。 */
    const fxMapping = {
        containerName: "container_effects",
        componentUrl: UiAutoBattleUnitHitFeedbackCom,
        parse: (name: string) => {
            for (const [pattern, field] of [
                [/^fx_float_(.+)$/, "fx_float"],
                [/^fx_flash_(.+)$/, "fx_flash"],
            ] as const) {
                const match = pattern.exec(name);
                if (match !== null) {
                    return { id: match[1]!, field };
                }
            }
            return undefined;
        },
        activeIds: (nodeNames: readonly string[]) => {
            const ids = new Set<string>();
            for (const name of nodeNames) {
                const match = /^unit_(.+)$/.exec(name);
                if (match !== null) {
                    ids.add(match[1]!);
                }
            }
            return ids;
        },
    };

    /** 构造页面 mock：含单位容器与特效容器两个动态实例容器。 */
    function makeMultiView(): {
        view: { name: string; getChild(name: string): unknown; children: unknown[] };
        unitContainer: { name: string; children: unknown[]; addChild(c: unknown): unknown; removeChild(c: unknown, dispose?: boolean): unknown };
        fxContainer: { name: string; children: unknown[]; addChild(c: unknown): unknown; removeChild(c: unknown, dispose?: boolean): unknown };
    } {
        const makeContainer = (name: string) => ({
            name,
            children: [] as unknown[],
            addChild(child: unknown) {
                this.children.push(child);
                return child;
            },
            removeChild(child: unknown) {
                const index = this.children.indexOf(child);
                if (index >= 0) this.children.splice(index, 1);
                return child;
            },
            getChild() {
                return null;
            },
        });
        const unitContainer = makeContainer("container_units");
        const fxContainer = makeContainer("container_effects");
        const view = {
            name: "AutoBattleView",
            children: [unitContainer, fxContainer],
            getChild(name: string) {
                return this.children.find((c) => (c as { name?: string })?.name === name) ?? null;
            },
        };
        return { view, unitContainer, fxContainer };
    }

    test("resolves fx nodes through the second mapping into its own container", async () => {
        const { createDynamicComponentViewHandle } = await loadHandle();
        const { view, unitContainer, fxContainer } = makeMultiView();
        const resolver = createDynamicComponentViewHandle(
            view as never,
            [unitMapping as never, fxMapping as never],
        );

        const floatNode = resolver("fx_float_a");
        expect(floatNode).toBeDefined();
        // 特效实例进入独立容器，单位容器不受影响
        expect(fxContainer.children).toHaveLength(1);
        expect(unitContainer.children).toHaveLength(0);

        // 单位节点仍走第一套映射
        resolver("unit_a");
        expect(unitContainer.children).toHaveLength(1);
    });

    test("prune reaps fx instances when their unit is no longer bound", async () => {
        const { createDynamicComponentViewHandle } = await loadHandle();
        const { view, fxContainer } = makeMultiView();
        const resolver = createDynamicComponentViewHandle(
            view as never,
            [unitMapping as never, fxMapping as never],
        );

        resolver("unit_a");
        resolver("unit_b");
        resolver("fx_float_a");
        resolver("fx_float_b");
        expect(fxContainer.children).toHaveLength(2);

        // 绑定集只剩 unit_a（fx 节点名不在绑定集内）：b 的 FX 实例随 b 的 UnitSlot 一起回收
        resolver.prune(["unit_a", "txt_unit_a_name", "bar_unit_a_hp"]);
        expect(fxContainer.children).toHaveLength(1);

        // 单位全部离场：FX 实例全部回收
        resolver.prune([]);
        expect(fxContainer.children).toHaveLength(0);
    });
});
