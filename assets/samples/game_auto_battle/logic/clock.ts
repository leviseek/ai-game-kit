import { SimulationClock, type IModule, type ITimeSource } from "../../../framework";

/**
 * 可控模拟时钟：now() 返回当前模拟时间，只经 advance 推进，与真实时钟无关。
 * 实现框架 ITimeSource 契约，供战斗事件时间戳与呈现器推进共用同一时间基准。
 * 实现复用框架 SimulationClock（确定性时钟语义：拒绝负值推进、timeScale 倍率、
 * 暂停/恢复），框架根入口现已导出该原语，品类层不再自实现最小副本。
 * timeScale 为倍率语义：advance(ms) 推进 ms * timeScale，供加速挡位复用——
 * 挡位只改变模拟时间流速与呈现器推进量，不改变 tick 内容与战斗结果。
 */
export interface AutoBattleClock extends ITimeSource {
    advance(milliseconds: number): void;
    /** 当前模拟时间倍率（默认 1，仅呈现器按挡位设置）。 */
    readonly timeScale: number;
    /** 设置倍率：必须为有限正数，非法值抛错。 */
    setTimeScale(rate: number): void;
}

export function createAutoBattleClock(initialTime = 0): AutoBattleClock {
    return new SimulationClock({ initialTime });
}

/**
 * 时钟模块：组合根创建可控时钟并注入战斗；模块只登记引用，
 * 时钟推进经 fixture.clock.advance 由测试驱动，模块生命周期无副作用。
 */
export function createAutoBattleClockModule(clock: AutoBattleClock): IModule {
    return {
        id: "auto_battle.clock",
        dependencies: [],
        start: () => {
            // 时钟在组合根构造时即就绪；start 只是让模块进入装配清单
            void clock.now();
        },
        dispose: () => {
            // 时钟由组合根统一释放，此处不处置
        },
    };
}

/**
 * 挂机墙钟：now() 返回当前墙钟时间，用于离线收益结算读取同一时间基准。
 * 缺省读取真实时间（Date.now），真实运行下 now() 随真实时间流逝自然增长，
 * 收益才会累积；advance 叠加偏移仅供测试注入可控基准（nowSource 返回固定值）
 * 后经 advance 模拟离线时长。框架 WallClock 已导出但只读（无 offset 控制），
 * 本实现以 WallClock 同构的 nowSource 注入 + 本地偏移推进，满足测试可控需求。
 */
export interface IdleRewardClock extends ITimeSource {
    advance(milliseconds: number): void;
}

export function createIdleRewardClock(nowSource: () => number = () => Date.now()): IdleRewardClock {
    let offset = 0;

    return {
        now: () => nowSource() + offset,
        advance: (milliseconds: number) => {
            // 与其它品类时钟先例一致：拒绝负值推进，保证时间单调，
            // 避免倒退破坏离线收益结算（结算按 now - lastSeenAt 差值）
            if (milliseconds < 0) {
                throw new Error("IdleRewardClock advance must not be negative");
            }
            offset += milliseconds;
        },
    };
}

/**
 * 挂机墙钟模块：组合根创建墙钟并注入挂机收益；模块只登记引用，
 * 真实运行由 Date.now 自然驱动、测试经注入时钟 advance 驱动。
 */
export function createIdleRewardClockModule(clock: IdleRewardClock): IModule {
    return {
        id: "auto_battle.idle_reward_clock",
        dependencies: [],
        start: () => {
            // 时钟在组合根构造时即就绪；start 只是让模块进入装配清单
            void clock.now();
        },
        dispose: () => {
            // 时钟由组合根统一释放，此处不处置
        },
    };
}
