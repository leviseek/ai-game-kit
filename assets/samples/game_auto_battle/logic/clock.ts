import type { Module, TimeSource } from "../../../framework";

/**
 * 可控模拟时钟：now() 返回当前模拟时间，只经 advance 推进，与真实时钟无关。
 * 实现框架 TimeSource 契约，供战斗事件时间戳与呈现器推进共用同一时间基准。
 * 框架根入口不导出 SimulationClock（public-boundary 白名单），故夹具层自实现
 * 最小可控时钟，保证确定性战斗可经 advance 独立驱动。
 */
export interface AutoBattleClock extends TimeSource {
    advance(milliseconds: number): void;
}

export function createAutoBattleClock(initialTime = 0): AutoBattleClock {
    let current = initialTime;

    return {
        now: () => current,
        advance: (milliseconds: number) => {
            // 与其它品类时钟先例一致：拒绝负值推进，保证时间单调，
            // 避免倒退破坏事件时间戳单调性与确定性
            if (milliseconds < 0) {
                throw new Error("AutoBattleClock advance must not be negative");
            }
            current += milliseconds;
        },
    };
}

/**
 * 时钟模块：组合根创建可控时钟并注入战斗；模块只登记引用，
 * 时钟推进经 fixture.clock.advance 由测试驱动，模块生命周期无副作用。
 */
export function createAutoBattleClockModule(clock: AutoBattleClock): Module {
    return {
        id: "auto_battle.clock",
        dependencies: [],
        start: () => {
            // 时钟在组合根构造时即就绪；start 只是让模块进入装配清单
            void clock.now();
        },
    };
}
