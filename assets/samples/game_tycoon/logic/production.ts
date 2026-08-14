import type { IModule } from "../../../framework";
import type { TycoonConfigHandle } from "./config";
import type { TycoonClock } from "./clock";
import type { TycoonEconomicState, TycoonProductionState } from "../models";

/**
 * 经济控制器：持有现金与各产品库存。生产开始时经 pay 扣成本，
 * 生产完成经 onProductComplete 入库存，出售经 sell 换现金。
 * 经济模型只存在于游戏层（5.1 负向断言锁定），组合根只注入配置。
 */
export interface TycoonEconomyHandle {
    readonly state: TycoonEconomicState;
    readonly cash: number;
    readonly inventory: Readonly<Record<string, number>>;
    /** 支付生产成本：生产开始时调用，现金扣减。 */
    pay(cost: number): void;
    /** 生产完成结算：产品入库存。 */
    onProductComplete(productId: string): void;
    /** 出售指定产品一件：按配置售价入账，库存不足拒绝。 */
    sell(productId: string): boolean;
}

export function createTycoonEconomy(config: TycoonConfigHandle): TycoonEconomyHandle {
    let cash = config.startCash;
    const inventory = new Map<string, number>();

    // 只返回可枚举字段的副本，避免调用方持有内部引用（ES2015 兼容，不用 Object.fromEntries）
    const inventorySnapshot = (): Readonly<Record<string, number>> => {
        const snapshot: Record<string, number> = {};
        for (const [productId, count] of inventory) {
            snapshot[productId] = count;
        }
        return snapshot;
    };

    return {
        get state(): TycoonEconomicState {
            return {
                cash,
                inventory: inventorySnapshot(),
            };
        },
        get cash(): number {
            return cash;
        },
        get inventory(): Readonly<Record<string, number>> {
            return inventorySnapshot();
        },
        pay(cost: number): void {
            cash -= cost;
        },
        onProductComplete(productId: string): void {
            inventory.set(productId, (inventory.get(productId) ?? 0) + 1);
        },
        sell(productId: string): boolean {
            const stock = inventory.get(productId) ?? 0;
            if (stock <= 0) {
                return false;
            }

            const product = config.products.find((entry) => entry.id === productId);
            if (product === undefined) {
                return false;
            }

            inventory.set(productId, stock - 1);
            cash += product.price;
            return true;
        },
    };
}

/**
 * 经济模块：组合根创建经济控制器并注入；模块只登记引用，不在此释放共享
 * 控制器——组合根的 dispose 统一负责（对齐 GameFixture 幂等契约）。
 */
export function createTycoonEconomyModule(economy: TycoonEconomyHandle): IModule {
    return {
        id: "tycoon.economy",
        dependencies: [],
        start: () => {
            // 控制器在组合根构造时即就绪；start 只是让模块进入装配清单
            void economy.cash;
        },
    };
}

/**
 * 生产进度控制器：持有当前生产中的产品与进度，由调度器 tick 驱动推进。
 * 进度按墙钟（模拟时钟）流逝计算：生产开始记录起点，tick 时若已超过
 * 配置时长则完成入库存。业务规则（成本/售价/时长）只来自注入配置，
 * 框架层不出现生产链/经济模型（5.1 负向断言锁定）。
 */
export interface TycoonProductionHandle {
    readonly state: TycoonProductionState;
    /** 开始生产一个产品：需现金足够且产线空闲；返回是否已开始。 */
    start(productId: string): boolean;
    /** 调度器 tick 驱动的推进：按时钟流逝结算生产进度并处理完成。 */
    applyTick(): void;
    dispose(): void;
}

export function createTycoonProduction(clock: TycoonClock, config: TycoonConfigHandle, economy: TycoonEconomyHandle): TycoonProductionHandle {
    let activeProductId: string | null = null;
    let startedAtMs = 0;
    let disposed = false;

    return {
        get state(): TycoonProductionState {
            if (activeProductId === null) {
                return { activeProductId: null, progress: 0 };
            }

            const product = config.products.find((entry) => entry.id === activeProductId);
            if (product === undefined || product.durationMs <= 0) {
                return { activeProductId, progress: 0 };
            }

            // 进度按时钟流逝惰性推导：只经时钟推进变化，不依赖外部写状态
            const elapsed = clock.now() - startedAtMs;
            return {
                activeProductId,
                progress: Math.min(1, elapsed / product.durationMs),
            };
        },
        start(productId: string): boolean {
            if (disposed || activeProductId !== null) {
                return false;
            }

            const product = config.products.find((entry) => entry.id === productId);
            if (product === undefined || economy.cash < product.cost) {
                return false;
            }

            economy.pay(product.cost);
            activeProductId = productId;
            startedAtMs = clock.now();
            return true;
        },
        applyTick(): void {
            if (disposed || activeProductId === null) {
                return;
            }

            const product = config.products.find((entry) => entry.id === activeProductId);
            if (product === undefined) {
                return;
            }

            // 已超过配置时长即完成：入库存并回到空闲，等待下次 start
            if (clock.now() - startedAtMs >= product.durationMs) {
                economy.onProductComplete(activeProductId);
                activeProductId = null;
                startedAtMs = 0;
            }
        },
        dispose(): void {
            if (disposed) {
                return;
            }
            disposed = true;
            activeProductId = null;
        },
    };
}

/**
 * 生产模块：组合根创建控制器并注入；模块只登记引用，不在 dispose 释放共享
 * 控制器——组合根的 dispose 统一负责（避免 failRollback 探针复用模块实例时
 * 提前销毁夹具自身能力，对齐 GameFixture 幂等契约）。
 */
export function createTycoonProductionModule(production: TycoonProductionHandle): IModule {
    return {
        id: "tycoon.production",
        dependencies: [],
        start: () => {
            // 控制器在组合根构造时即就绪；start 只是让模块进入装配清单
            void production.state;
        },
    };
}
