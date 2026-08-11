import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

import { createFairyGuiMock } from "./helpers/fairygui-mock";

// 实现值 import fairygui-cc；统一使用共享 fixture 避免全量运行解析失败
mock.module("fairygui-cc", () => createFairyGuiMock());

/** 战场单位节点映射：`unit_{id}` 系列运行时实例化 UnitSlot（复用 samples 的契约形状）。 */
const unitMapping = {
    containerName: "container_units",
    componentUrl: "ui://cmn00001com03",
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
