import type { Module } from "../../../framework";
import {
    configArray,
    configNumber,
    configObject,
    createConfigTable,
    type ConfigTable,
} from "../../../framework";
import type {
    AutoBattleSide,
    AutoBattleSkill,
    AutoBattleUnit,
} from "../models";

/** 配置读取句柄：把不可变配置表解析为双方单位清单与能量规则。 */
export interface AutoBattleConfigHandle {
    readonly ally: readonly AutoBattleUnit[];
    readonly enemy: readonly AutoBattleUnit[];
    /** 攻击者每次普攻增长的能量。 */
    readonly energyGainAttacker: number;
    /** 受击者每次受普攻增长的能量。 */
    readonly energyGainTarget: number;
}

/** 类型守卫：校验配置条目是合法的技能定义。 */
function isSkillConfig(value: unknown): value is AutoBattleSkill {
    if (value === null || typeof value !== "object") {
        return false;
    }

    const record = value as Record<string, unknown>;

    return (
        typeof record.id === "string" &&
        record.id.length > 0 &&
        typeof record.name === "string" &&
        record.name.length > 0 &&
        (record.kind === "damage" || record.kind === "heal") &&
        typeof record.value === "number" &&
        Number.isFinite(record.value) &&
        record.value >= 0 &&
        typeof record.energyCost === "number" &&
        Number.isFinite(record.energyCost) &&
        record.energyCost > 0
    );
}

/** 类型守卫：校验配置条目是合法的单位定义（不包含 side/index，由队推导）。 */
function isUnitConfig(value: unknown): value is Omit<AutoBattleUnit, "side" | "index"> {
    if (value === null || typeof value !== "object") {
        return false;
    }

    const record = value as Record<string, unknown>;

    return (
        typeof record.id === "string" &&
        record.id.length > 0 &&
        typeof record.name === "string" &&
        record.name.length > 0 &&
        (record.position === "front" ||
            record.position === "mid" ||
            record.position === "back") &&
        typeof record.maxHp === "number" &&
        Number.isFinite(record.maxHp) &&
        record.maxHp > 0 &&
        typeof record.attack === "number" &&
        Number.isFinite(record.attack) &&
        record.attack >= 0 &&
        typeof record.speed === "number" &&
        Number.isFinite(record.speed) &&
        record.speed >= 0 &&
        typeof record.energyMax === "number" &&
        Number.isFinite(record.energyMax) &&
        record.energyMax > 0 &&
        isSkillConfig(record.skill)
    );
}

/** 读取一队单位清单：逐项校验，非法条目抛错并给出序号定位。 */
function readTeam(
    table: ConfigTable,
    key: string,
    side: AutoBattleSide,
): readonly AutoBattleUnit[] {
    const raw = table.read(key, configArray, []);
    if (raw.length === 0) {
        throw new Error(`auto-battle config: team "${key}" must not be empty`);
    }
    return raw.map((entry, index) => {
        if (!isUnitConfig(entry)) {
            throw new Error(
                `auto-battle config: team "${key}" entry at index ${index} has an invalid shape`,
            );
        }
        return { ...entry, side, index };
    });
}

function readEnergyGain(table: ConfigTable, key: string, fallback: number): number {
    const value = table.read(key, configNumber, fallback);
    if (value < 0) {
        throw new Error(`auto-battle config: ${key} must not be negative`);
    }
    return value;
}

/**
 * 从不可变配置表读取自动战斗数值：双方单位清单逐项校验为合法单位，
 * 能量增长规则按 configNumber 读取（缺省键走传入的缺省内容）。配置内容
 * 由组合根注入；本模块只负责解析，不承载业务数值的默认值来源之外逻辑。
 */
export function createAutoBattleConfig(
    content: Record<string, unknown>,
): AutoBattleConfigHandle {
    const table: ConfigTable = createConfigTable(content);

    const teams = table.read("teams", configObject, {});
    const teamTable: ConfigTable = createConfigTable(teams);

    return {
        ally: readTeam(teamTable, "ally", "ally"),
        enemy: readTeam(teamTable, "enemy", "enemy"),
        energyGainAttacker: readEnergyGain(table, "energyGainAttacker", 10),
        energyGainTarget: readEnergyGain(table, "energyGainTarget", 5),
    };
}

/**
 * 配置模块：组合根创建配置句柄并注入；模块只登记引用，配置表为不可变数据，
 * 生命周期无副作用，不在此释放共享配置。
 */
export function createAutoBattleConfigModule(
    config: AutoBattleConfigHandle,
): Module {
    return {
        id: "auto_battle.config",
        dependencies: [],
        start: () => {
            // 配置句柄在组合根构造时即就绪；start 只是让模块进入装配清单
            void config.ally.length;
        },
    };
}
