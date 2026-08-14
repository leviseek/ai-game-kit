import type { IConfigKey, IModule } from "../../../framework";
import { configArray, configNumber, createConfigTable, type IConfigTable } from "../../../framework";
import type { CardConfig } from "../models";

// branded 键无运行期值：读取前把配置键字符串收窄为品牌类型
function keyOf(key: string): IConfigKey {
    return key as unknown as IConfigKey;
}

/** 配置读取句柄：把不可变配置表解析为卡牌数值与回合时长。 */
export interface CardConfigHandle {
    readonly cards: readonly CardConfig[];
    readonly turnDurationMs: number;
    readonly playerHp: number;
    readonly enemyHp: number;
    readonly startMana: number;
    /** 敌方攻击间隔：敌方阶段每经过该时长攻击一次玩家。 */
    readonly enemyAttackIntervalMs: number;
    /** 敌方单次攻击伤害。 */
    readonly enemyDamage: number;
}

/** 类型守卫：校验配置条目是合法的卡牌数值。 */
function isCardConfig(value: unknown): value is CardConfig {
    if (value === null || typeof value !== "object") {
        return false;
    }

    const record = value as Record<string, unknown>;

    return (
        typeof record.id === "string" &&
        typeof record.name === "string" &&
        // 与框架 configNumber 语义一致：只接受有限数值；卡牌成本与伤害为非负
        typeof record.cost === "number" &&
        Number.isFinite(record.cost) &&
        record.cost >= 0 &&
        typeof record.damage === "number" &&
        Number.isFinite(record.damage) &&
        record.damage >= 0
    );
}

/**
 * 从不可变配置表读取卡牌数值：cards 数组逐项校验为 CardConfig，
 * 其余字段按 configNumber 读取（缺省键走传入的缺省内容）。配置内容
 * 由组合根注入；本模块只负责解析，不承载业务数值的默认值来源之外逻辑。
 */
export function createCardConfig(content: Record<string, unknown>): CardConfigHandle {
    const table: IConfigTable = createConfigTable(content);

    const rawCards = table.read(keyOf("cards"), configArray, []);
    const cards = rawCards.map((entry, index) => {
        if (!isCardConfig(entry)) {
            throw new Error(`card config entry at index ${index} has an invalid shape`);
        }
        return entry;
    });

    return {
        cards,
        turnDurationMs: table.read(keyOf("turnDurationMs"), configNumber, 1000),
        playerHp: table.read(keyOf("playerHp"), configNumber, 10),
        enemyHp: table.read(keyOf("enemyHp"), configNumber, 8),
        startMana: table.read(keyOf("startMana"), configNumber, 3),
        enemyAttackIntervalMs: table.read(keyOf("enemyAttackIntervalMs"), configNumber, 500),
        enemyDamage: table.read(keyOf("enemyDamage"), configNumber, 2),
    };
}

/**
 * 配置模块：组合根创建配置句柄并注入；模块只登记引用，配置表为不可变数据，
 * 生命周期无副作用，不在此释放共享配置。
 */
export function createCardConfigModule(config: CardConfigHandle): IModule {
    return {
        id: "card.config",
        dependencies: [],
        start: () => {
            // 配置句柄在组合根构造时即就绪；start 只是让模块进入装配清单
            void config.turnDurationMs;
        },
    };
}
