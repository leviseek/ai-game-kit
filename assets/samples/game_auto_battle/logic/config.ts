import type { Module } from "../../../framework";
import { configArray, configNumber, configObject, createConfigTable, type ConfigTable } from "../../../framework";
import type { AutoBattleHero, AutoBattleSide, AutoBattleSkill, AutoBattleUnit } from "../models";

/**
 * 每队单位数量上限：战斗规模可配置为 1..MAX_TEAM_SIZE（首版 1v1..6v6）。
 * 配置解析按该上限校验，超出即拒绝开战；上限是战斗常量而非可调数据。
 */
export const MAX_TEAM_SIZE = 6;

/** 配置读取句柄：把不可变配置表解析为双方单位清单、英雄池、初始编队与能量规则。 */
export interface AutoBattleConfigHandle {
    readonly ally: readonly AutoBattleUnit[];
    readonly enemy: readonly AutoBattleUnit[];
    /** 英雄池：静态英雄配置，供编队编辑引用（形状为 AutoBattleUnit 去 side/index）。 */
    readonly heroes: readonly AutoBattleHero[];
    /** 初始编队：ally/enemy 的 heroId 槽位序列（开战时由 lineup 实例化单位）。 */
    readonly lineups: {
        readonly ally: readonly string[];
        readonly enemy: readonly string[];
    };
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
        record.energyCost > 0 &&
        (record.teleportTo === undefined || (typeof record.teleportTo === "string" && /^\d+:\d+$/.test(record.teleportTo)))
    );
}

/** 类型守卫：校验配置条目是合法的英雄条目（不包含 side/index，由队推导）。 */
function isHeroConfig(value: unknown): value is AutoBattleHero {
    if (value === null || typeof value !== "object") {
        return false;
    }

    const record = value as Record<string, unknown>;

    return (
        typeof record.id === "string" &&
        record.id.length > 0 &&
        typeof record.name === "string" &&
        record.name.length > 0 &&
        (record.position === "front" || record.position === "mid" || record.position === "back") &&
        typeof record.maxHp === "number" &&
        Number.isFinite(record.maxHp) &&
        record.maxHp > 0 &&
        typeof record.attack === "number" &&
        Number.isFinite(record.attack) &&
        record.attack >= 0 &&
        typeof record.speed === "number" &&
        Number.isFinite(record.speed) &&
        record.speed >= 0 &&
        (record.attackRange === undefined || (typeof record.attackRange === "number" && Number.isFinite(record.attackRange) && record.attackRange >= 0)) &&
        typeof record.energyMax === "number" &&
        Number.isFinite(record.energyMax) &&
        record.energyMax > 0 &&
        isSkillConfig(record.skill)
    );
}

/** 读取英雄条目并补充缺省 attackRange（默认 1，向后兼容旧配置无该字段）。 */
function readHeroAttackRange(record: { readonly attackRange?: number }): number {
    const range = record.attackRange;
    return range === undefined ? 1 : range;
}

/** 读取一队单位清单：逐项校验，非法条目抛错并给出序号定位。 */
function readTeam(table: ConfigTable, key: string, side: AutoBattleSide): readonly AutoBattleUnit[] {
    const raw = table.read(key, configArray, []);
    if (raw.length === 0) {
        throw new Error(`auto-battle config: team "${key}" must not be empty`);
    }
    // 逻辑槽位 0..N-1：每队至多 MAX_TEAM_SIZE 单位，超规模配置拒绝开战
    if (raw.length > MAX_TEAM_SIZE) {
        throw new Error(`auto-battle config: team "${key}" must have at most ${MAX_TEAM_SIZE} units`);
    }
    return raw.map((entry, index) => {
        if (!isHeroConfig(entry)) {
            throw new Error(`auto-battle config: team "${key}" entry at index ${index} has an invalid shape`);
        }
        return {
            ...entry,
            attackRange: readHeroAttackRange(entry),
            side,
            index,
        };
    });
}

/** 校验英雄池 id 唯一：编队按 id 引用，重名会造成歧义。 */
function assertUniqueHeroIds(heroes: readonly AutoBattleHero[]): void {
    const seen = new Set<string>();
    for (const hero of heroes) {
        if (seen.has(hero.id)) {
            throw new Error(`auto-battle config: duplicate hero id "${hero.id}"`);
        }
        seen.add(hero.id);
    }
}

/** 读取英雄池：逐项校验合法（复用英雄条目形状校验），池内 id 唯一。 */
function readHeroes(table: ConfigTable): readonly AutoBattleHero[] {
    const raw = table.read("heroes", configArray, []);
    const heroes = raw.map((entry, index) => {
        if (!isHeroConfig(entry)) {
            throw new Error(`auto-battle config: heroes entry at index ${index} has an invalid shape`);
        }
        return { ...entry, attackRange: readHeroAttackRange(entry) };
    });
    assertUniqueHeroIds(heroes);
    return heroes;
}

/**
 * 读取一队初始编队（heroId 序列）：校验引用存在且未超上阵上限，展开为
 * 战斗单位（附加 side 与队内逻辑槽位 index）。返回展开后的单位与原始 id 序列，
 * 供开战实例化与编队持久化复用。
 */
function readLineup(
    table: ConfigTable,
    key: string,
    side: AutoBattleSide,
    heroById: ReadonlyMap<string, AutoBattleHero>,
): { readonly units: readonly AutoBattleUnit[]; readonly ids: readonly string[] } {
    const raw = table.read(key, configArray, []);
    if (raw.length === 0) {
        throw new Error(`auto-battle config: lineups.${key} must not be empty`);
    }
    if (raw.length > MAX_TEAM_SIZE) {
        throw new Error(`auto-battle config: lineups.${key} must have at most ${MAX_TEAM_SIZE} heroes`);
    }
    const ids: string[] = [];
    const seen = new Set<string>();
    const units = raw.map((entry, index) => {
        if (typeof entry !== "string" || entry.length === 0) {
            throw new Error(`auto-battle config: lineups.${key} entry at index ${index} must be a hero id`);
        }
        if (seen.has(entry)) {
            throw new Error(`auto-battle config: lineups.${key} repeats hero id "${entry}"`);
        }
        seen.add(entry);
        const heroDef = heroById.get(entry);
        if (heroDef === undefined) {
            throw new Error(`auto-battle config: lineups.${key} references unknown hero "${entry}"`);
        }
        ids.push(entry);
        return { ...heroDef, side, index };
    });
    return { units, ids };
}

function readEnergyGain(table: ConfigTable, key: string, fallback: number): number {
    const value = table.read(key, configNumber, fallback);
    if (value < 0) {
        throw new Error(`auto-battle config: ${key} must not be negative`);
    }
    return value;
}

/**
 * 从不可变配置表读取自动战斗数值：优先读取 heroes 池 + lineups（英雄 id 序列，
 * 开战由编队实例化）；无 heroes 键时回退到 teams 兼容格式（deprecated，转出
 * 英雄池与编队使既有配置仍可开战）。两者并存时以 heroes 为准、teams 被忽略
 * （视为配置误写，不再叠加）。兼容格式的转出会收紧既有行为：跨队同 id 的英雄
 * 会被唯一性校验拒绝（旧版同 id 单位本就令 unitById 撞车）。能量增长规则按
 * configNumber 读取（缺省键走传入的缺省内容）。配置内容由组合根注入；本模块
 * 只负责解析，不承载业务数值的默认值来源之外逻辑。
 */
export function createAutoBattleConfig(content: Record<string, unknown>): AutoBattleConfigHandle {
    const table: ConfigTable = createConfigTable(content);

    const energyGainAttacker = readEnergyGain(table, "energyGainAttacker", 10);
    const energyGainTarget = readEnergyGain(table, "energyGainTarget", 5);

    // 新格式：heroes 池 + lineups
    if (Object.prototype.hasOwnProperty.call(content, "heroes")) {
        const heroes = readHeroes(table);
        const heroById = new Map(heroes.map((hero) => [hero.id, hero]));
        const lineupsTable: ConfigTable = createConfigTable(table.read("lineups", configObject, {}));
        const ally = readLineup(lineupsTable, "ally", "ally", heroById);
        const enemy = readLineup(lineupsTable, "enemy", "enemy", heroById);
        return {
            ally: ally.units,
            enemy: enemy.units,
            heroes,
            lineups: { ally: ally.ids, enemy: enemy.ids },
            energyGainAttacker,
            energyGainTarget,
        };
    }

    // 兼容格式（deprecated）：teams 直接提供双方单位清单
    const teams = table.read("teams", configObject, {});
    const teamTable: ConfigTable = createConfigTable(teams);
    const ally = readTeam(teamTable, "ally", "ally");
    const enemy = readTeam(teamTable, "enemy", "enemy");
    const heroes = [...ally, ...enemy].map((unit) => ({
        id: unit.id,
        name: unit.name,
        position: unit.position,
        maxHp: unit.maxHp,
        attack: unit.attack,
        speed: unit.speed,
        attackRange: unit.attackRange,
        energyMax: unit.energyMax,
        skill: unit.skill,
    }));
    assertUniqueHeroIds(heroes);

    return {
        ally,
        enemy,
        heroes,
        lineups: {
            ally: ally.map((unit) => unit.id),
            enemy: enemy.map((unit) => unit.id),
        },
        energyGainAttacker,
        energyGainTarget,
    };
}

/**
 * 配置模块：组合根创建配置句柄并注入；模块只登记引用，配置表为不可变数据，
 * 生命周期无副作用，不在此释放共享配置。
 */
export function createAutoBattleConfigModule(config: AutoBattleConfigHandle): Module {
    return {
        id: "auto_battle.config",
        dependencies: [],
        start: () => {
            // 配置句柄在组合根构造时即就绪；start 只是让模块进入装配清单
            void config.ally.length;
        },
    };
}
