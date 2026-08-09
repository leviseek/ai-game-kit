import type { Module } from "../../framework";
import {
    configArray,
    configNumber,
    createConfigTable,
    type ConfigTable,
} from "../../framework";
import type { TycoonProduct } from "../models";

/** 配置读取句柄：把不可变配置表解析为产品清单与初始现金。 */
export interface TycoonConfigHandle {
    readonly products: readonly TycoonProduct[];
    readonly startCash: number;
}

/** 类型守卫：校验配置条目是合法的产品数值（成本/售价/时长均为有限非负）。 */
function isTycoonProduct(value: unknown): value is TycoonProduct {
    if (value === null || typeof value !== "object") {
        return false;
    }

    const record = value as Record<string, unknown>;

    return (
        typeof record.id === "string" &&
        typeof record.name === "string" &&
        typeof record.cost === "number" &&
        Number.isFinite(record.cost) &&
        record.cost >= 0 &&
        typeof record.price === "number" &&
        Number.isFinite(record.price) &&
        record.price >= 0 &&
        typeof record.durationMs === "number" &&
        Number.isFinite(record.durationMs) &&
        record.durationMs >= 0
    );
}

/**
 * 从不可变配置表读取经营数值：products 数组逐项校验为 TycoonProduct，
 * startCash 按 configNumber 读取并校验有限非负（缺省键走传入的缺省内容）。
 * 配置内容由组合根注入；本模块只负责解析，与生产/经济逻辑解耦（数值与来源分离）。
 */
export function createTycoonConfig(
    content: Record<string, unknown>,
): TycoonConfigHandle {
    const table: ConfigTable = createConfigTable(content);

    const rawProducts = table.read("products", configArray, []);
    const products = rawProducts.map((entry, index) => {
        if (!isTycoonProduct(entry)) {
            throw new Error(`tycoon product config entry at index ${index} has an invalid shape`);
        }
        return entry;
    });

    // 与产品数值校验一致：初始现金只接受有限非负，负值开局会让所有生产永久失败，
    // 属配置错误应 fail-fast，而不是静默进入"看似可用实则全拒"的状态
    const startCash = table.read("startCash", configNumber, 100);
    if (!Number.isFinite(startCash) || startCash < 0) {
        throw new Error("tycoon startCash must be finite and non-negative");
    }

    return {
        products,
        startCash,
    };
}

/**
 * 配置模块：组合根创建配置句柄并注入；模块只登记引用，配置表为不可变数据，
 * 生命周期无副作用，不在此释放共享配置。
 */
export function createTycoonConfigModule(config: TycoonConfigHandle): Module {
    return {
        id: "tycoon.config",
        dependencies: [],
        start: () => {
            // 配置句柄在组合根构造时即就绪；start 只是让模块进入装配清单
            void config.products;
        },
    };
}
