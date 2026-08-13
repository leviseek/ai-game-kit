import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

import { createFairyGuiMock } from "./helpers/fairygui-mock";

// 实现值 import fairygui-cc；统一使用共享 fixture 避免全量运行解析失败。
// 采用动态加载模式（mock 后 import），避免静态 import 在 mock 前解析。
mock.module("fairygui-cc", () => createFairyGuiMock());

const HANDLE_FILE = resolve(import.meta.dir, "../../../assets/framework/adapters/cocos/ui/FairyGuiViewHandle.ts");

async function loadHandle(): Promise<{
    wrapFairyGuiObjectTyped: (typeof import("../../../assets/framework/adapters/cocos/ui/FairyGuiViewHandle"))["wrapFairyGuiObjectTyped"];
}> {
    return (await import(pathToFileURL(HANDLE_FILE).href)) as never;
}

type FuiElementKind = "button" | "input" | "progress" | "text" | "richText" | "list" | "component" | "image" | "movieclip";

// duck-typed fgui 对象（text/value/on/visible），不依赖类引用，对齐运行时能力探测。
type DuckNode = {
    readonly name: string;
    text: string;
    value?: number;
    visible: boolean;
    onCalls: Array<{ type: string; handler: () => void }>;
    on(type: string, handler: () => void): void;
};

function makeDuckNode(name: string): DuckNode {
    return {
        name,
        text: "",
        visible: true,
        onCalls: [],
        on(type: string, handler: () => void) {
            this.onCalls.push({ type, handler });
        },
    };
}

describe("wrapFairyGuiObjectTyped", () => {
    test("button：写文本 + 点击注册", async () => {
        const { wrapFairyGuiObjectTyped } = await loadHandle();
        const node = makeDuckNode("btn");
        const typed = wrapFairyGuiObjectTyped(node as never, "button" as FuiElementKind);

        typed.setVisible(false);
        expect(node.visible).toBe(false);

        (typed as { setText(value: string): void }).setText("点击");
        expect(node.text).toBe("点击");

        const handler = mock(() => {});
        (typed as { onClick(handler: () => void): void }).onClick(handler);
        expect(node.onCalls.length).toBe(1);
        node.onCalls[0]!.handler();
        expect(handler).toHaveBeenCalled();
    });

    test("text：读写文本 + 显隐", async () => {
        const { wrapFairyGuiObjectTyped } = await loadHandle();
        const node = makeDuckNode("txt");
        const typed = wrapFairyGuiObjectTyped(node as never, "text" as FuiElementKind) as {
            text(): string;
            setText(value: string): void;
            setVisible(v: boolean): void;
        };

        typed.setText("你好");
        expect(typed.text()).toBe("你好");
        typed.setVisible(false);
        expect(node.visible).toBe(false);
    });

    test("input：读输入值（读方向不经绑定写回）", async () => {
        const { wrapFairyGuiObjectTyped } = await loadHandle();
        const node = makeDuckNode("input");
        node.text = "account";
        const typed = wrapFairyGuiObjectTyped(node as never, "input" as FuiElementKind) as {
            readText(): string;
        };

        expect(typed.readText()).toBe("account");
    });

    test("progress：归一化 0..1 写 value（0..100）", async () => {
        const { wrapFairyGuiObjectTyped } = await loadHandle();
        const node = makeDuckNode("bar");
        node.value = 0;
        const typed = wrapFairyGuiObjectTyped(node as never, "progress" as FuiElementKind) as {
            setProgress(value: number): void;
        };

        typed.setProgress(0.5);
        expect(node.value).toBe(50);
        typed.setProgress(1.5);
        expect(node.value).toBe(100);
        typed.setProgress(-0.5);
        expect(node.value).toBe(0);
    });

    test("无 value 的对象进度写值安全跳过", async () => {
        const { wrapFairyGuiObjectTyped } = await loadHandle();
        const node = makeDuckNode("plain");
        const typed = wrapFairyGuiObjectTyped(node as never, "progress" as FuiElementKind) as {
            setProgress(value: number): void;
        };
        expect(() => typed.setProgress(0.5)).not.toThrow();
    });

    test("component/richText 回落对应能力形态", async () => {
        const { wrapFairyGuiObjectTyped } = await loadHandle();
        const node = makeDuckNode("comp");
        const component = wrapFairyGuiObjectTyped(node as never, "component" as FuiElementKind);
        expect(() => component.setVisible(true)).not.toThrow();
        expect(node.visible).toBe(true);

        const rich = makeDuckNode("rich");
        const richTyped = wrapFairyGuiObjectTyped(rich as never, "richText" as FuiElementKind);
        expect(() => richTyped.setVisible(false)).not.toThrow();
    });

    test("image/list/movieclip：显隐能力", async () => {
        const { wrapFairyGuiObjectTyped } = await loadHandle();
        for (const kind of ["image", "list", "movieclip"] as FuiElementKind[]) {
            const node = makeDuckNode(kind);
            const typed = wrapFairyGuiObjectTyped(node as never, kind);
            typed.setVisible(false);
            expect(node.visible).toBe(false);
        }
    });
});
