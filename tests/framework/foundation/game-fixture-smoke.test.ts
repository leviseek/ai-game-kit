import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import {
    createGameFixture,
    type GameFixture,
} from "../../../assets/game/fixture/GameFixture";
import type { GameFixtureRegistry } from "../../../assets/game/fixture/registry";
import { runFixtureSmoke } from "../../../assets/game/fixture/smoke";

const projectRoot = resolve(import.meta.dir, "../../..");

async function captureFixtureSmoke(
    fixtureId: string,
    registry: GameFixtureRegistry,
): Promise<string[]> {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => logs.push(String(message));

    try {
        await runFixtureSmoke(fixtureId, registry);
    } finally {
        console.log = originalLog;
    }

    return logs.filter((line) => line.startsWith("[fixture-smoke]"));
}

describe("game fixture smoke runner", () => {
    test("reports an unknown fixture without throwing", async () => {
        const markers = await captureFixtureSmoke("rpg", {});

        expect(markers.some((line) => line.includes("fixture-unknown: FAIL"))).toBe(
            true,
        );
    });

    test("drives a registered fixture through the uniform lifecycle", async () => {
        const registry: GameFixtureRegistry = {
            rpg: () => createGameFixture({ id: "rpg", modules: [] }),
        };

        const markers = await captureFixtureSmoke("rpg", registry);

        const expectedSteps = [
            "fixture-found",
            "start",
            "pause",
            "resume",
            "failRollback",
            "dispose",
        ];

        for (const step of expectedSteps) {
            expect(markers.some((line) => line.includes(`${step}: ok`))).toBe(true);
        }
        expect(markers.some((line) => line.includes(": FAIL"))).toBe(false);
    });

    test("reports audio-degraded marker when the fixture exposes a degraded audio backend", async () => {
        const base = createGameFixture({ id: "fight", modules: [] });
        const registry: GameFixtureRegistry = {
            fight: () =>
                Object.assign(base, {
                    audio: { degraded: true },
                }),
        };

        const markers = await captureFixtureSmoke("fight", registry);

        expect(
            markers.some((line) => line.includes("audio-degraded: ok")),
        ).toBe(true);
        expect(
            markers.some((line) => line.includes("degraded=true")),
        ).toBe(true);
    });

    test("reports audio-degraded FAIL when the fixture audio backend is available", async () => {
        const base = createGameFixture({ id: "fight", modules: [] });
        const registry: GameFixtureRegistry = {
            fight: () =>
                Object.assign(base, {
                    audio: { degraded: false },
                }),
        };

        const markers = await captureFixtureSmoke("fight", registry);

        expect(
            markers.some((line) => line.includes("audio-degraded: FAIL")),
        ).toBe(true);
        expect(
            markers.some((line) => line.includes("degraded=false")),
        ).toBe(true);
    });

    test("does not emit audio-degraded marker for fixtures without the audio capability", async () => {
        const registry: GameFixtureRegistry = {
            rpg: () => createGameFixture({ id: "rpg", modules: [] }),
        };

        const markers = await captureFixtureSmoke("rpg", registry);

        expect(
            markers.some((line) => line.includes("audio-degraded")),
        ).toBe(false);
    });

    test("reports a lifecycle failure without throwing", async () => {
        const failingFixture: GameFixture = {
            id: "broken",
            modules: [],
            start: async () => {
                throw new Error("boom");
            },
            pause: async () => { },
            resume: async () => { },
            failRollback: async () => { },
            dispose: async () => { },
        };
        const registry: GameFixtureRegistry = {
            broken: () => failingFixture,
        };

        const markers = await captureFixtureSmoke("broken", registry);

        expect(markers.some((line) => line.includes("start: FAIL"))).toBe(true);
    });

    test("reports a factory construction failure without throwing", async () => {
        const registry: GameFixtureRegistry = {
            boom: () => {
                throw new Error("factory boom");
            },
        };

        const markers = await captureFixtureSmoke("boom", registry);

        expect(markers.some((line) => line.includes("fixture-create: FAIL"))).toBe(
            true,
        );
        expect(markers.some((line) => line.includes("factory boom"))).toBe(true);
    });
});

describe("SmokeProxy fixture smoke forwarding", () => {
    test("wires the fixture smoke runner from the game layer fixture via SmokeProxy", () => {
        const smokeProxyFile = resolve(projectRoot, "assets/boot/smoke/smoke-proxy.ts");
        expect(existsSync(smokeProxyFile)).toBe(true);

        // 文本断言仅防"删除转发"，不防"转发逻辑错误"；转发行为由 boot-flow /
        // boot-smoke-router 运行测试兜底
        const source = readFileSync(smokeProxyFile, "utf8");

        expect(source).toMatch(/from\s*["'][^"']*game\/fixture\/smoke["']/);
        expect(source).toMatch(/runFixtureSmoke/);
    });
});
