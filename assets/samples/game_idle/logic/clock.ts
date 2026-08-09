import type { Module, TimeSource } from "../../../framework";

/**
 * 可控墙钟：now() 返回当前墙钟时间，只经 advance 推进，用于模拟离线时长。
 * 实现框架 TimeSource 契约，供在线收益调度与离线收益结算共用同一时间基准。
 * 框架根入口不导出 WallClock（public-boundary 白名单），
 * 故夹具层自实现最小可控墙钟，保证离线结算可经 advance 独立驱动。
 */
export interface IdleClock extends TimeSource {
    advance(milliseconds: number): void;
}

export function createIdleClock(initialTime = 0): IdleClock {
    let current = initialTime;

    return {
        now: () => current,
        advance: (milliseconds: number) => {
            // 与框架时钟先例一致：拒绝负值推进，保证时间单调，避免倒退破坏离线结算
            if (milliseconds < 0) {
                throw new Error("IdleClock advance must not be negative");
            }
            current += milliseconds;
        },
    };
}

/**
 * 时钟模块：组合根创建可控墙钟并注入成长进度与调度器；模块只登记引用，
 * 墙钟推进经 fixture.clock.advance 由测试驱动，模块生命周期无副作用。
 */
export function createIdleClockModule(clock: IdleClock): Module {
    return {
        id: "idle.clock",
        dependencies: [],
        start: () => {
            // 时钟在组合根构造时即就绪；start 只是让模块进入装配清单
            void clock.now();
        },
    };
}
