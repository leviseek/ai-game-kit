import type { IModule, ITimeSource } from "../../../framework";

/**
 * 可控模拟时钟：now() 返回当前模拟时间，只经 advance 推进，与真实时钟无关。
 * 实现框架 ITimeSource 契约，供回合流与输入采样共用同一时间基准。
 * 框架根入口不导出 SimulationClock（public-boundary 白名单），
 * 故夹具层自实现最小可控时钟，保证确定性回合可经 advance 独立驱动。
 */
export interface CardSimClock extends ITimeSource {
    advance(milliseconds: number): void;
}

export function createCardSimClock(initialTime = 0): CardSimClock {
    let current = initialTime;

    return {
        now: () => current,
        advance: (milliseconds: number) => {
            // 与框架 SimulationClock 先例一致：拒绝负值推进，保证时间单调，
            // 避免倒退破坏 enemy 阶段超时判定与回合确定性
            if (milliseconds < 0) {
                throw new Error("CardSimClock advance must not be negative");
            }
            current += milliseconds;
        },
    };
}

/**
 * 时钟模块：组合根创建可控时钟并注入回合流与输入映射；模块只登记引用，
 * 时钟推进经 fixture.clock.advance 由测试驱动，模块生命周期无副作用。
 */
export function createCardClockModule(clock: CardSimClock): IModule {
    return {
        id: "card.clock",
        dependencies: [],
        start: () => {
            // 时钟在组合根构造时即就绪；start 只是让模块进入装配清单
            void clock.now();
        },
    };
}
