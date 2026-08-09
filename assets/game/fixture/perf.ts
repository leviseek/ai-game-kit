import type { GameFixture } from "./GameFixture";
import {
    gameFixtureRegistry,
    type GameFixtureRegistry,
} from "./registry";

/**
 * 单次性能采样：由注入的采样器（组合根经 Cocos Profiler 提供）读取当前帧的
 * 引擎运行状态。游戏层保持引擎无关，采样值以引擎无关的纯数值表达。
 */
export interface PerfSample {
    /** 当前帧率（FPS）。 */
    readonly fps: number;
    /** 单帧耗时（毫秒）。 */
    readonly frameMs: number;
    /** 游戏逻辑耗时（毫秒）。 */
    readonly logicMs: number;
    /** 渲染 Draw Call 数。 */
    readonly draws: number;
    /** 纹理内存（MB）。 */
    readonly textureMemoryMB: number;
    /** 缓冲区内存（MB）。 */
    readonly bufferMemoryMB: number;
}

/** 性能采样器：返回当前帧的引擎运行状态；不可用时返回 null（采样被跳过）。 */
export type PerfSampler = () => PerfSample | null;

/** 一组采样值的统计区间：最小值、平均值、最大值。 */
export interface PerfRange {
    readonly min: number;
    readonly avg: number;
    readonly max: number;
}

/** 性能检查汇总：采样数量与各指标统计区间。 */
export interface PerfSummary {
    readonly samples: number;
    readonly fps: PerfRange;
    readonly frameMs: PerfRange;
    readonly logicMs: PerfRange;
    readonly draws: PerfRange;
    readonly textureMemoryMB: PerfRange;
    readonly bufferMemoryMB: PerfRange;
}

/** 性能检查运行选项：采样窗口与间隔可注入替身以支持纯 TS 测试。 */
export interface RunFixturePerfOptions {
    /** 采样窗口时长（毫秒），缺省 3000。 */
    readonly windowMs?: number;
    /** 相邻采样间隔（毫秒），缺省 250。 */
    readonly intervalMs?: number;
    /** 睡眠函数：测试注入即时替身避免真实等待。 */
    readonly sleep?: (ms: number) => Promise<void>;
}

function summarize(values: readonly number[]): PerfRange {
    if (values.length === 0) {
        return { min: 0, avg: 0, max: 0 };
    }
    let min = values[0];
    let max = values[0];
    let sum = 0;
    for (const value of values) {
        if (value < min) {
            min = value;
        }
        if (value > max) {
            max = value;
        }
        sum += value;
    }
    return {
        min: Math.round(min * 100) / 100,
        avg: Math.round((sum / values.length) * 100) / 100,
        max: Math.round(max * 100) / 100,
    };
}

/** 对采样结果做统计汇总：各指标取最小/平均/最大值。 */
export function aggregatePerfSamples(samples: readonly PerfSample[]): PerfSummary {
    const fps = samples.map((sample) => sample.fps);
    const frameMs = samples.map((sample) => sample.frameMs);
    const logicMs = samples.map((sample) => sample.logicMs);
    const draws = samples.map((sample) => sample.draws);
    const textureMemoryMB = samples.map((sample) => sample.textureMemoryMB);
    const bufferMemoryMB = samples.map((sample) => sample.bufferMemoryMB);

    return {
        samples: samples.length,
        fps: summarize(fps),
        frameMs: summarize(frameMs),
        logicMs: summarize(logicMs),
        draws: summarize(draws),
        textureMemoryMB: summarize(textureMemoryMB),
        bufferMemoryMB: summarize(bufferMemoryMB),
    };
}

/**
 * 基础性能检查：构造品类夹具、驱动生命周期，并在 running 窗口内按固定间隔
 * 经注入采样器收集引擎运行状态。每步经 console 输出 `[fixture-perf]` 标记，
 * 由 headless Chrome + CDP 采集验证（对齐 runFixtureSmoke）。采样器不可用时
 * 采样被跳过，生命周期仍完整执行；汇总统计由引擎无关的纯函数完成。
 */
export async function runFixturePerf(
    fixtureId: string,
    sampler: PerfSampler,
    registry?: GameFixtureRegistry,
    options: RunFixturePerfOptions = {},
): Promise<void> {
    const report = (step: string, ok: boolean, detail = "") => {
        console.log(
            `[fixture-perf] ${step}: ${ok ? "ok" : "FAIL"}${detail ? ` (${detail})` : ""}`,
        );
    };

    const windowMs = options.windowMs ?? 3000;
    const intervalMs = options.intervalMs ?? 250;
    const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

    // registry 在调用时解析：samples 未加载时经 gameFixtureRegistry() 返回空表，
    // 工厂缺失按既有语义报告 fixture-unknown，不抛错
    const resolved = registry ?? gameFixtureRegistry();

    const factory = resolved[fixtureId];

    if (factory === undefined) {
        report("fixture-unknown", false, `no factory for "${fixtureId}"`);
        return;
    }

    let fixture: GameFixture;

    try {
        fixture = factory();
    } catch (error) {
        report(
            "fixture-create",
            false,
            error instanceof Error ? error.message : String(error),
        );
        return;
    }

    report("fixture-found", true, fixtureId);

    try {
        await fixture.start();
        report("start", true);
    } catch (error) {
        report(
            "start",
            false,
            error instanceof Error ? error.message : String(error),
        );
        return;
    }

    // running 窗口内采样：采样器不可用时返回 null 被跳过，仍持续到窗口结束
    const samples: PerfSample[] = [];
    const deadline = Date.now() + windowMs;
    while (Date.now() < deadline) {
        await sleep(intervalMs);
        const sample = sampler();
        if (sample !== null) {
            samples.push(sample);
        }
    }

    const summary = aggregatePerfSamples(samples);
    report("samples", summary.samples > 0, String(summary.samples));
    if (summary.samples > 0) {
        const range = (label: string, value: PerfRange) => {
            console.log(
                `[fixture-perf] ${label}: avg=${value.avg} min=${value.min} max=${value.max}`,
            );
        };
        range("fps", summary.fps);
        range("frame-ms", summary.frameMs);
        range("logic-ms", summary.logicMs);
        range("draws", summary.draws);
        range("texture-memory-mb", summary.textureMemoryMB);
        range("buffer-memory-mb", summary.bufferMemoryMB);
    }

    for (const [step, run] of [
        ["pause", (f: GameFixture) => f.pause()],
        ["resume", (f: GameFixture) => f.resume()],
        ["dispose", (f: GameFixture) => f.dispose()],
    ] as const) {
        try {
            await run(fixture);
            report(step, true);
        } catch (error) {
            report(
                step,
                false,
                error instanceof Error ? error.message : String(error),
            );
            return;
        }
    }

    console.log("[fixture-perf] complete");
}
