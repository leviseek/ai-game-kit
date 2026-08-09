import type { Module, TimeSource } from "../../framework";

/**
 * 可控模拟时钟：now() 返回当前模拟时间，只经 advance 推进，与真实时钟无关。
 * 实现框架 TimeSource 契约，为输入采样提供单调时间戳，消除确定性偏差
 * （对齐 task 7.4：RPG 输入采样时间源与其他品类统一为可控时钟）。
 * 框架根入口不导出 SimulationClock（public-boundary 白名单），
 * 故夹具层自实现最小可控时钟，保证输入采样时间戳可独立驱动。
 */
export interface RpgSimClock extends TimeSource {
    advance(milliseconds: number): void;
}

export function createRpgSimClock(initialTime = 0): RpgSimClock {
    let current = initialTime;

    return {
        now: () => current,
        advance: (milliseconds: number) => {
            // 与框架时钟先例一致：拒绝负值推进，保证时间单调，避免破坏采样时间戳
            if (milliseconds < 0) {
                throw new Error("RpgSimClock advance must not be negative");
            }
            current += milliseconds;
        },
    };
}

/**
 * 时钟模块：组合根创建可控时钟并注入输入映射；模块只登记引用，
 * 时钟推进经 fixture.clock.advance 由测试驱动，模块生命周期无副作用。
 */
export function createRpgClockModule(clock: RpgSimClock): Module {
    return {
        id: "rpg.clock",
        dependencies: [],
        start: () => {
            // 时钟在组合根构造时即就绪；start 只是让模块进入装配清单
            void clock.now();
        },
    };
}
