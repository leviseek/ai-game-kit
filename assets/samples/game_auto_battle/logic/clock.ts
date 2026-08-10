import type { Module, TimeSource } from "../../../framework";

/** 倍率校验：必须为有限正数，与框架 SimulationClock 的 timeScale 约束一致。 */
function isValidRate(rate: number): boolean {
    return Number.isFinite(rate) && rate > 0;
}

/**
 * 可控模拟时钟：now() 返回当前模拟时间，只经 advance 推进，与真实时钟无关。
 * 实现框架 TimeSource 契约，供战斗事件时间戳与呈现器推进共用同一时间基准。
 * 框架根入口不导出 SimulationClock（public-boundary 白名单），故夹具层自实现
 * 最小可控时钟，保证确定性战斗可经 advance 独立驱动。
 * timeScale 为倍率语义：advance(ms) 推进 ms * timeScale，供加速挡位复用——
 * 挡位只改变模拟时间流速与呈现器推进量，不改变 tick 内容与战斗结果。
 */
export interface AutoBattleClock extends TimeSource {
    advance(milliseconds: number): void;
    /** 当前模拟时间倍率（默认 1，仅呈现器按挡位设置）。 */
    readonly timeScale: number;
    /** 设置倍率：必须为有限正数，非法值抛错。 */
    setTimeScale(rate: number): void;
}

export function createAutoBattleClock(initialTime = 0): AutoBattleClock {
    let current = initialTime;
    let rate = 1;

    return {
        now: () => current,
        get timeScale(): number {
            return rate;
        },
        setTimeScale: (nextRate: number) => {
            if (!isValidRate(nextRate)) {
                throw new Error(
                    "AutoBattleClock timeScale must be finite and greater than zero",
                );
            }
            rate = nextRate;
        },
        advance: (milliseconds: number) => {
            // 与其它品类时钟先例一致：拒绝负值推进，保证时间单调，
            // 避免倒退破坏事件时间戳单调性与确定性
            if (milliseconds < 0) {
                throw new Error("AutoBattleClock advance must not be negative");
            }
            // 按当前倍率换算推进量：默认 1 时与历史行为一致
            current += milliseconds * rate;
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
