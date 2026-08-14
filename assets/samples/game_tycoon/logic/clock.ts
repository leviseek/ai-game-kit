import { SimulationClock, type IModule, type ITimeSource } from "../../../framework";

/**
 * 可控模拟时钟：now() 返回当前模拟时间，只经 advance 推进，与真实时钟无关。
 * 实现框架 ITimeSource 契约，供生产推进与调度器共用同一时间基准。
 * 实现复用框架 SimulationClock（框架根入口已导出），品类层不再自实现最小副本。
 */
export interface TycoonClock extends ITimeSource {
    advance(milliseconds: number): void;
}

export function createTycoonClock(initialTime = 0): TycoonClock {
    return new SimulationClock({ initialTime });
}

/**
 * 时钟模块：组合根创建可控时钟并注入生产与调度器；模块只登记引用，
 * 时钟推进经 fixture.clock.advance 由测试驱动，模块生命周期无副作用。
 */
export function createTycoonClockModule(clock: TycoonClock): IModule {
    return {
        id: "tycoon.clock",
        dependencies: [],
        start: () => {
            // 时钟在组合根构造时即就绪；start 只是让模块进入装配清单
            void clock.now();
        },
    };
}
