import { describe, expect, it } from "bun:test";
import { getBundleModuleRegistry } from "../../../assets/framework/core/module/BundleModuleRegistry";

// 通用注册测试使用唯一 bundle 名，不得污染真实 samples/game 描述符
// （真实 samples 由 assets/samples/entry.ts 经 SAMPLES_BUNDLE_DESCRIPTOR 注册）。
describe("BundleModuleRegistry", () => {
    it("register 后 lookup 可读回同一对象", () => {
        const registry = getBundleModuleRegistry();
        const exports = { fixtures: { card: () => ({}) } };
        registry.registerBundle("bundle-registry-test", exports);
        expect(registry.lookupBundle("bundle-registry-test")).toBe(exports);
    });
    it("同名 register 幂等覆盖", () => {
        const registry = getBundleModuleRegistry();
        registry.registerBundle("bundle-registry-test", { a: 1 });
        registry.registerBundle("bundle-registry-test", { b: 2 });
        expect(registry.lookupBundle("bundle-registry-test")).toEqual({ b: 2 });
    });
    it("未注册返回 undefined", () => {
        expect(getBundleModuleRegistry().lookupBundle("no-such-bundle")).toBeUndefined();
    });
});
