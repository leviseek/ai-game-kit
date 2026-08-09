import { describe, expect, it } from "bun:test";
import { getBundleModuleRegistry } from "../../../assets/framework/core/module/BundleModuleRegistry";

describe("BundleModuleRegistry", () => {
    it("register 后 lookup 可读回同一对象", () => {
        const registry = getBundleModuleRegistry();
        const exports = { fixtures: { card: () => ({}) } };
        registry.registerBundle("samples", exports);
        expect(registry.lookupBundle("samples")).toBe(exports);
    });
    it("同名 register 幂等覆盖", () => {
        const registry = getBundleModuleRegistry();
        registry.registerBundle("game", { a: 1 });
        registry.registerBundle("game", { b: 2 });
        expect(registry.lookupBundle("game")).toEqual({ b: 2 });
    });
    it("未注册返回 undefined", () => {
        expect(getBundleModuleRegistry().lookupBundle("no-such-bundle")).toBeUndefined();
    });
});
