import { SimulationClock, type IModule, type ITimeSource } from "../../../framework";

/**
 * 可控时钟：now() 返回当前时间，只经 advance 推进，用于模拟离线时长。
 * 实现框架 ITimeSource 契约，供在线收益调度与离线收益结算共用同一时间基准。
 * 实现复用框架 SimulationClock（框架根入口已导出），品类层不再自实现最小副本。
 */
export interface IdleClock extends ITimeSource {
    advance(milliseconds: number): void;
}

export function createIdleClock(initialTime = 0): IdleClock {
    return new SimulationClock({ initialTime });
}

/**
 * 时钟模块：组合根创建可控墙钟并注入成长进度与调度器；模块只登记引用，
 * 墙钟推进经 fixture.clock.advance 由测试驱动，模块生命周期无副作用。
 */
export function createIdleClockModule(clock: IdleClock): IModule {
    return {
        id: "idle.clock",
        dependencies: [],
        start: () => {
            // 时钟在组合根构造时即就绪；start 只是让模块进入装配清单
            void clock.now();
        },
    };
}
