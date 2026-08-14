import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

import { createFairyGuiMock } from "./helpers/fairygui-mock";
import { UiAutoBattleAutoBattleView } from "../../../assets/ui/generated/ui-autobattle";
import type { IViewModelNode } from "../../../assets/framework";

mock.module("fairygui-cc", () => createFairyGuiMock());

/** GObject 的最小可用 mock：只实现 wrapFairyGuiObject 消费的能力。 */
function makeObject(overrides: Partial<Record<string, unknown>> = {}): {
    url: string | null;
    setUrlWithBundle: (url: string, bundle?: string) => void;
    readonly calls: { readonly bundle: string | undefined; readonly path: string }[];
} {
    const calls: { bundle: string | undefined; path: string }[] = [];
    const obj = {
        url: null,
        text: "",
        value: undefined,
        visible: true,
        alpha: 1,
        setPosition() {},
        on() {},
        setUrlWithBundle(url: string, bundle?: string) {
            calls.push({ bundle, path: url });
        },
        ...overrides,
    };
    return { ...obj, calls };
}

/** 动态 import 适配层（避免静态 import 在 mock 前加载失败）。 */
const HANDLE_FILE = resolve(import.meta.dir, "../../../assets/framework/adapters/cocos/ui/FairyGuiViewHandle.ts");

async function loadWrap(): Promise<(typeof import("../../../assets/framework/adapters/cocos/ui/FairyGuiViewHandle"))["wrapFairyGuiObject"]> {
    const mod = (await import(pathToFileURL(HANDLE_FILE).href)) as {
        wrapFairyGuiObject: (typeof import("../../../assets/framework/adapters/cocos/ui/FairyGuiViewHandle"))["wrapFairyGuiObject"];
    };
    return mod.wrapFairyGuiObject;
}

describe("FairyGuiViewHandle wrapFairyGuiObject setUrl", () => {
    test("bundle:// URL routes to setUrlWithBundle with bundle name and path", async () => {
        const wrap = await loadWrap();
        const obj = makeObject();
        const node: IViewModelNode = wrap(obj as never);
        node.setUrl("bundle://animations/auto-battle/fx_explosion_00");
        expect(obj.calls).toEqual([{ bundle: "animations", path: "auto-battle/fx_explosion_00" }]);
    });

    test("ui:// URL writes directly to url property", async () => {
        const wrap = await loadWrap();
        const obj = makeObject();
        const node: IViewModelNode = wrap(obj as never);
        node.setUrl(UiAutoBattleAutoBattleView);
        expect(obj.url).toBe(UiAutoBattleAutoBattleView);
        expect(obj.calls).toEqual([]);
    });

    test("plain path URL writes directly to url property (no bundle prefix)", async () => {
        const wrap = await loadWrap();
        const obj = makeObject();
        const node: IViewModelNode = wrap(obj as never);
        node.setUrl("img/bg_battle.png");
        expect(obj.url).toBe("img/bg_battle.png");
        expect(obj.calls).toEqual([]);
    });

    test("object without setUrlWithBundle falls back to url property", async () => {
        const wrap = await loadWrap();
        const obj = makeObject({ setUrlWithBundle: undefined });
        const node: IViewModelNode = wrap(obj as never);
        node.setUrl("bundle://animations/auto-battle/warrior_f_idle_00");
        // 无 setUrlWithBundle 能力：直接写 url（普通加载路径，兼容非 loader 节点）
        expect(obj.url).toBe("bundle://animations/auto-battle/warrior_f_idle_00");
        expect(obj.calls).toEqual([]);
    });

    test("setUrl on node without url capability is skipped without interrupting", async () => {
        const wrap = await loadWrap();
        // 无 url 属性（静态 image 节点）：setUrl 安全跳过（"url" in obj 为 false）
        const obj = makeObject();
        delete (obj as { url?: string | null }).url;
        const node: IViewModelNode = wrap(obj as never);
        node.setUrl("bundle://animations/auto-battle/fx_explosion_00");
        expect(obj.calls).toEqual([]);
    });
});
