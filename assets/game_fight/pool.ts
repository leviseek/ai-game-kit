import type { Module } from "../framework";
import { createObjectPool } from "../framework";

/**
 * 命中特效对象：战斗命中时从对象池借出、帧末归还，复用而非反复创建。
 * 对象池由框架显式所有者对象池（explicit-owner）承载。
 */
export interface FightEffect {
    readonly id: number;
}

/** 对象池句柄：暴露借出/归还与累计创建次数（复用断言依赖）。 */
export interface FightEffectPool {
    acquire(): FightEffect;
    release(effect: FightEffect): void;
    /** 工厂累计创建的对象数量：复用断言依赖（不应随命中次数线性增长）。 */
    readonly created: number;
    dispose(): void;
}

const POOL_CAPACITY = 4;

/**
 * 命中特效对象池：容量固定，超出容量的借出创建临时对象并上报溢出；
 * 战斗命中持续发生时对象被复用，created 保持在小值。
 */
export function createFightEffectPool(): FightEffectPool {
    let nextId = 1;
    let created = 0;

    const pool = createObjectPool<FightEffect>({
        capacity: POOL_CAPACITY,
        factory: () => {
            created += 1;
            return { id: nextId };
        },
        reset: () => {
            // 复用前无状态需要清理
        },
    });

    return {
        acquire: () => pool.acquire(),
        release: (effect: FightEffect) => pool.release(effect),
        get created() {
            return created;
        },
        dispose: () => {
            pool.dispose();
        },
    };
}

/**
 * 对象池模块：组合根创建对象池并注入战斗；模块只登记引用，
 * 池的借出/归还由战斗控制器驱动，模块生命周期无副作用。
 */
export function createFightPoolModule(pool: FightEffectPool): Module {
    return {
        id: "fight.pool",
        dependencies: [],
        start: () => {
            // 对象池在组合根构造时即就绪；start 只是让模块进入装配清单
            void pool.created;
        },
    };
}
