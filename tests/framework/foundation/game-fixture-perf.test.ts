import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import {
    aggregatePerfSamples,
    runFixturePerf,
    type PerfSample,
    type PerfSummary,
} from "../../../assets/game/fixture/perf";
import {
    createGameFixture,
    type GameFixture,
} from "../../../assets/game/fixture/GameFixture";
import type { GameFixtureRegistry } from "../../../assets/game/fixture/registry";

const projectRoot = resolve(import.meta.dir, "../../..");

/** 即时睡眠：性能采样循环不真实等待。 */
const immediateSleep = () => Promise.resolve();

async function captureFixturePerf(
    fixtureId: string,
    sampler: () => PerfSample | null,
    registry: GameFixtureRegistry,
): Promise<string[]> {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => logs.push(String(message));

    try {
        await runFixturePerf(fixtureId, sampler, registry, {
            windowMs: 10,
            intervalMs: 1,
            sleep: immediateSleep,
        });
    } finally {
        console.log = originalLog;
    }

    return logs.filter((line) => line.startsWith("[fixture-perf]"));
}

function makeSample(overrides: Partial<PerfSample> = {}): PerfSample {
    return {
        fps: 60,
        frameMs: 16.7,
        logicMs: 0.5,
        draws: 1,
        textureMemoryMB: 4.2,
        bufferMemoryMB: 0.8,
        ...overrides,
    };
}

describe("game fixture perf runner", () => {
    test("aggregatePerfSamples computes min/avg/max and sample count", () => {
        const summary: PerfSummary = aggregatePerfSamples([
            makeSample({ fps: 55, draws: 1 }),
            makeSample({ fps: 60, draws: 3 }),
            makeSample({ fps: 65, draws: 2 }),
        ]);

        expect(summary.samples).toBe(3);
        expect(summary.fps).toEqual({ min: 55, avg: 60, max: 65 });
        expect(summary.draws).toEqual({ min: 1, avg: 2, max: 3 });
        expect(summary.frameMs.avg).toBe(16.7);
    });

    test("aggregatePerfSamples returns zero ranges for empty input", () => {
        const summary: PerfSummary = aggregatePerfSamples([]);
        expect(summary.samples).toBe(0);
        expect(summary.fps).toEqual({ min: 0, avg: 0, max: 0 });
    });

    test("reports an unknown fixture without throwing", async () => {
        const markers = await captureFixturePerf("rpg", () => null, {});

        expect(markers.some((line) => line.includes("fixture-unknown: FAIL"))).toBe(
            true,
        );
    });

    test("reports a factory construction failure without throwing", async () => {
        const registry: GameFixtureRegistry = {
            boom: () => {
                throw new Error("factory boom");
            },
        };

        const markers = await captureFixturePerf("boom", () => null, registry);

        expect(markers.some((line) => line.includes("fixture-create: FAIL"))).toBe(
            true,
        );
        expect(markers.some((line) => line.includes("factory boom"))).toBe(true);
    });

    test("drives lifecycle and samples during the running window", async () => {
        const registry: GameFixtureRegistry = {
            rpg: () => createGameFixture({ id: "rpg", modules: [] }),
        };
        let sampleCalls = 0;

        const markers = await captureFixturePerf(
            "rpg",
            () => {
                sampleCalls += 1;
                return makeSample();
            },
            registry,
        );

        const expectedSteps = [
            "fixture-found",
            "start",
            "samples",
            "pause",
            "resume",
            "dispose",
        ];

        for (const step of expectedSteps) {
            expect(markers.some((line) => line.includes(`${step}: ok`))).toBe(true);
        }

        // 采样窗口推进多次：每个周期一次采样
        expect(sampleCalls).toBeGreaterThan(0);
        expect(markers.some((line) => line.includes(": FAIL"))).toBe(false);
        expect(markers.some((line) => line.includes("complete"))).toBe(true);
    });

    test("reports metric markers when samples were collected", async () => {
        const registry: GameFixtureRegistry = {
            rpg: () => createGameFixture({ id: "rpg", modules: [] }),
        };

        const markers = await captureFixturePerf(
            "rpg",
            () => makeSample(),
            registry,
        );

        expect(markers.some((line) => line.includes("fps: avg=60"))).toBe(true);
        expect(markers.some((line) => line.includes("frame-ms: avg=16.7"))).toBe(
            true,
        );
        expect(markers.some((line) => line.includes("logic-ms: avg=0.5"))).toBe(
            true,
        );
        expect(markers.some((line) => line.includes("draws: avg=1"))).toBe(true);
        expect(
            markers.some((line) => line.includes("texture-memory-mb: avg=4.2")),
        ).toBe(true);
        expect(
            markers.some((line) => line.includes("buffer-memory-mb: avg=0.8")),
        ).toBe(true);
    });

    test("skips null samples without breaking the lifecycle", async () => {
        const registry: GameFixtureRegistry = {
            rpg: () => createGameFixture({ id: "rpg", modules: [] }),
        };
        let calls = 0;

        // 采样器一半返回 null：不可用采样被跳过，生命周期仍完整执行
        const markers = await captureFixturePerf(
            "rpg",
            () => {
                calls += 1;
                return calls % 2 === 0 ? makeSample() : null;
            },
            registry,
        );

        expect(markers.some((line) => line.includes("start: ok"))).toBe(true);
        expect(markers.some((line) => line.includes("dispose: ok"))).toBe(true);
        expect(markers.some((line) => line.includes("complete"))).toBe(true);
    });

    test("reports lifecycle failure without throwing", async () => {
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

        const markers = await captureFixturePerf("broken", () => null, registry);

        expect(markers.some((line) => line.includes("start: FAIL"))).toBe(true);
    });
});

describe("boot fixture perf module", () => {
    test("dispatches the game-layer perf runner via the bridge with a Cocos profiler sampler", () => {
        const smokeProxyFile = resolve(projectRoot, "assets/boot/smoke/SmokeProxy.ts");
        expect(existsSync(smokeProxyFile)).toBe(true);

        const source = readFileSync(smokeProxyFile, "utf8");
        // perf 采样器归置于 boot/profiler.ts（冒烟与 dev overlay 共用），boot 不再
        // 静态 import game/fixture/perf（仅类型），perf 运行器经注册桥读取
        expect(source).toMatch(/sampleProfilerStats/);
        expect(source).toMatch(/lookupBundle\("game"\)/);
        expect(source).toMatch(/smokes\?\.perf/);

        const profilerFile = resolve(projectRoot, "assets/boot/profiler.ts");
        expect(existsSync(profilerFile)).toBe(true);
        const profilerSource = readFileSync(profilerFile, "utf8");
        expect(profilerSource).toMatch(/profiler\.stats/);
        expect(profilerSource).toMatch(/import\s*\{[^}]*\bprofiler\b[^}]*\}\s*from\s+["']cc["']/);
    });

    test("keeps the perf runner in the game layer", () => {
        const perfFile = resolve(projectRoot, "assets/game/fixture/perf.ts");
        expect(existsSync(perfFile)).toBe(true);

        const source = readFileSync(perfFile, "utf8");
        expect(source).toMatch(/runFixturePerf/);
    });
});
