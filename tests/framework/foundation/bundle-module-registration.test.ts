import { describe, expect, it } from "bun:test";
import { registerBundle } from "../../../assets/framework";
import { gameFixtureRegistry } from "../../../assets/game/fixture/registry";
import type { GameFixture } from "../../../assets/game/fixture/GameFixture";
import { SAMPLES_BUNDLE_DESCRIPTOR } from "../../../assets/samples/entry";

const stubFixture = (id: string): GameFixture => ({
    id,
    modules: [],
    start: async () => {},
    pause: async () => {},
    resume: async () => {},
    failRollback: async () => {},
    dispose: async () => {},
});

describe("samples 自注册桥", () => {
    it("samples 未注册（或未提供 fixtures）时返回空表", () => {
        // 全局注册桥跨测试文件进程共享：game-lobby-catalog / game-fixture-unified
        // 等测试经 samples/entry 副作用注册真实 fixtures，会污染本断言依赖的
        // "samples 未登记" 初始态。先显式覆盖为空描述符，使断言不依赖执行顺序；
        // finally 恢复真实 descriptor，避免污染后续用例读取。
        try {
            registerBundle("samples-other", {});
            registerBundle("samples", {});
            const registry = gameFixtureRegistry();
            expect(Object.keys(registry)).toEqual([]);
        } finally {
            registerBundle("samples", SAMPLES_BUNDLE_DESCRIPTOR);
        }
    });
    it("registerBundle('samples', { fixtures }) 后 gameFixtureRegistry() 可读取", () => {
        try {
            registerBundle("samples", { fixtures: { card: () => stubFixture("card") } });
            const registry = gameFixtureRegistry();
            const fixture = registry["card"]?.();
            expect(fixture?.id).toBe("card");
        } finally {
            registerBundle("samples", SAMPLES_BUNDLE_DESCRIPTOR);
        }
    });
});
