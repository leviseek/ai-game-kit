import { describe, expect, test, mock } from "bun:test";

import { createCcMock } from "./helpers/cc-mock";

// CocosDeviceInfo 经 cc.sys 接缝读取；cc mock 必须与其它测试文件一致
// （全局共享首个生效）。断言全部注入 sys 接缝，不依赖 mock 的 sys 值。
mock.module("cc", () => createCcMock());

const { createCocosDeviceInfo } = await import(
    "../../../assets/framework/adapters/cocos/device/CocosDeviceInfo"
);

describe("createCocosDeviceInfo", () => {
    test("注入 sys：platform=平台标识、model=OS 描述、language=语言", () => {
        const info = createCocosDeviceInfo({
            sys: { os: "iOS", platform: "MOBILE_BROWSER", language: "zh" },
        });
        expect(info.platform).toBe("MOBILE_BROWSER");
        expect(info.model).toBe("iOS");
        expect(info.language).toBe("zh");
    });

    test("缺省读 cc.sys 不抛错（值由 mock 环境决定）", () => {
        expect(() => createCocosDeviceInfo()).not.toThrow();
    });

    test("字段缺失/为空时降级 unknown", () => {
        const info = createCocosDeviceInfo({
            sys: { os: "", platform: undefined, language: "" },
        });
        expect(info.platform).toBe("unknown");
        expect(info.model).toBe("unknown");
        expect(info.language).toBe("unknown");
    });
});
