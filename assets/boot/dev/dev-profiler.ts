import { profiler } from "cc";
import type { PerfSample } from "../../game/fixture/perf";

/**
 * Cocos Profiler 采样器：读取当前帧引擎运行状态。stats 未就绪时返回 null
 * （调用方跳过本次采样）。每项为引擎计时器或渲染统计的实时值；纹理/缓冲区
 * 内存单位为 MB。采样器是装配层职责（依赖 cc），游戏层 runner 保持引擎无关
 * （对齐 boot/smoke 先例）。
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
