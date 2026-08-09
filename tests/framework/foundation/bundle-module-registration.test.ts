import { describe, expect, it } from "bun:test";
import { registerBundle } from "../../../assets/framework";
import { gameFixtureRegistry } from "../../../assets/game/fixture/registry";
import type { GameFixture } from "../../../assets/game/fixture/GameFixture";

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
    it("samples 未注册时返回空表", () => {
        registerBundle("samples-other", {});
        const registry = gameFixtureRegistry();
        expect(Object.keys(registry)).toEqual([]);
    });
    it("registerBundle('samples', { fixtures }) 后 gameFixtureRegistry() 可读取", () => {
        registerBundle("samples", { fixtures: { card: () => stubFixture("card") } });
        const registry = gameFixtureRegistry();
        const fixture = registry["card"]?.();
        expect(fixture?.id).toBe("card");
    });
});
