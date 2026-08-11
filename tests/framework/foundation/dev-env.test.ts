import { describe, expect, test } from "bun:test";

import { createIsDevEnabled } from "../../../assets/boot/dev/dev-env";

describe("createIsDevEnabled", () => {
    test("debug 构建无 URL 参数默认开启", () => {
        const isDevEnabled = createIsDevEnabled({ ccDebug: true, search: "" });
        expect(isDevEnabled()).toBe(true);
    });

    test("release 构建默认关闭", () => {
        const isDevEnabled = createIsDevEnabled({ ccDebug: false, search: "" });
        expect(isDevEnabled()).toBe(false);
    });

    test("?dev=0 覆盖 debug 构建强制关闭", () => {
        const isDevEnabled = createIsDevEnabled({
            ccDebug: true,
            search: "?dev=0",
        });
        expect(isDevEnabled()).toBe(false);
    });

    test("?dev=1 强制开启 release 构建", () => {
        const isDevEnabled = createIsDevEnabled({
            ccDebug: false,
            search: "?dev=1",
        });
        expect(isDevEnabled()).toBe(true);
    });

    test("?dev=1 在 debug 构建保持开启", () => {
        const isDevEnabled = createIsDevEnabled({
            ccDebug: true,
            search: "?dev=1",
        });
        expect(isDevEnabled()).toBe(true);
    });

    test("非法参数不抛错回退默认", () => {
        const isDevEnabled = createIsDevEnabled({
            ccDebug: true,
            search: "?dev=abc",
        });
        expect(() => isDevEnabled()).not.toThrow();
        expect(isDevEnabled()).toBe(true);
    });

    test("非法参数回退到 release 默认关闭", () => {
        const isDevEnabled = createIsDevEnabled({
            ccDebug: false,
            search: "?dev=yes",
        });
        expect(isDevEnabled()).toBe(false);
    });

    test("dev 参数与其他查询参数共存时正确解析", () => {
        const isDevEnabled = createIsDevEnabled({
            ccDebug: true,
            search: "?smoke=ui&dev=0&scale=2",
        });
        expect(isDevEnabled()).toBe(false);
    });

    test("dev 参数在查询串中间时正确解析", () => {
        const isDevEnabled = createIsDevEnabled({
            ccDebug: false,
            search: "?foo=1&dev=1&bar=2",
        });
        expect(isDevEnabled()).toBe(true);
    });
});
