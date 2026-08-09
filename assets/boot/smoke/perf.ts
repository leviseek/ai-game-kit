import { profiler } from "cc";
import { runFixturePerf, type PerfSample } from "../../game/fixture/perf";

/**
 * 性能采样器：读取 Cocos Profiler 当前帧的引擎运行状态。stats 未就绪时
 * 返回 null（由游戏层 runFixturePerf 跳过本次采样）。每项为引擎计时器或
 * 渲染统计的实时值；纹理/缓冲区内存单位为 MB。
 */
export function sampleProfilerStats(): PerfSample | null {
    const stats = profiler.stats;
    if (stats === null) {
        return null;
    }
    return {
        fps: stats.fps.counter.value,
        frameMs: stats.frame.counter.value,
        logicMs: stats.logic.counter.value,
        draws: stats.draws.counter.value,
        textureMemoryMB: stats.textureMemory.counter.value,
        bufferMemoryMB: stats.bufferMemory.counter.value,
    };
}

/**
 * 品类夹具基础性能检查分派：组合逻辑留在游戏层 runFixturePerf，此处注入
 * Cocos Profiler 采样器（采样器是唯一允许依赖 cc 的装配层职责）。`[fixture-perf]`
 * 标记由游戏层 runner 输出，由 headless Chrome + CDP 采集验证。
 */
export function runFixturePerfSmoke(fixtureId: string): Promise<void> {
    return runFixturePerf(fixtureId, sampleProfilerStats);
}
