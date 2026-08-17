import type { IConfigKey, IModule } from "../../../framework";
import { configArray, configNumber, configObject, createConfigTable, type IConfigTable } from "../../../framework";
import { AUTO_BATTLE_ANIM_NAMES } from "../models";
import type {
    AutoBattleAnimName,
    AutoBattleBaseAttributes,
    AutoBattleBuff,
    AutoBattleHero,
    AutoBattleSide,
    AutoBattleSkill,
    AutoBattleSkillCondition,
    AutoBattleSkillEffectDef,
    AutoBattleUnit,
    AutoBattleUnitAnimation,
} from "../models";

// branded 键无运行期值：读取前把配置键字符串收窄为品牌类型
function keyOf(key: string): IConfigKey {
    return key as unknown as IConfigKey;
}

/**
 * 每队单位数量上限：战斗规模可配置为 1..MAX_TEAM_SIZE（首版 1v1..6v6）。
 * 配置解析按该上限校验，超出即拒绝开战；上限是战斗常量而非可调数据。
 */
export const MAX_TEAM_SIZE = 6;

/** 配置读取句柄：把不可变配置表解析为双方单位清单、英雄池、初始编队、能量规则与 7 张表。 */
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
    /** 武将自身回合开始时恢复的固定能量（能量经济规则 1）。 */
    readonly energyGainAttacker: number;
    /** 受击者每次被敌方击打恢复的少量能量（非自己回合也能回复，规则 3）。 */
    readonly energyGainTarget: number;
    /** 移动能量消耗比例：移动一次消耗 ≈ 回合恢复量 × 该比例（规则 2，缺省 0.5）。 */
    readonly energyMoveCostRatio: number;
    /** 击杀敌方单位获得的大量能量（规则 4，缺省 10）。 */
    readonly energyGainOnKill: number;
    /** 1. 基础属性表：数值中心，单位按 baseAttributeId 引用。 */
    readonly baseAttributes: readonly AutoBattleBaseAttributes[];
    /** 2. 武将单位表：英雄池的原始静态定义（含表引用字段），供视图按 animationId 查动画。 */
    readonly heroDefinitions: readonly AutoBattleHeroDefinition[];
    /** 3. 单位动画表：animationId → 帧 URL 生成参数（视图层消费）。 */
    readonly unitAnimations: readonly AutoBattleUnitAnimation[];
    /** 4. 技能表：技能 id → 定义（含多效果/条件/动效引用）。 */
    readonly skills: readonly AutoBattleSkill[];
    /** 5. buff 表：buff id → 定义（战斗挂载与结算消费）。 */
    readonly buffs: readonly AutoBattleBuff[];
    /** 6. 技能动效表：effectId → 视觉意图（视图层投影消费）。 */
    readonly skillEffects: readonly AutoBattleSkillEffectDef[];
    /** 7. 技能条件表：conditionId → 判定规则（战斗流程消费）。 */
    readonly skillConditions: readonly AutoBattleSkillCondition[];
}

/** 英雄原始定义：与 AutoBattleHero 同形状但 skill 可能为 id 引用（解析时归一化展开）。 */
export interface AutoBattleHeroDefinition {
    readonly id: string;
    readonly name: string;
    readonly position: "front" | "mid" | "back";
    readonly maxHp?: number;
    readonly attack?: number;
    readonly speed?: number;
    readonly attackRange?: number;
    readonly movePoints?: number;
    readonly energyMax: number;
    readonly skill?: AutoBattleSkill;
    readonly skillId?: string;
    readonly baseAttributeId?: string;
    readonly animationId?: string;
}

/** 类型守卫：校验技能效果条目（damage/heal/buff）。 */
function isSkillEffectConfig(value: unknown): value is { readonly kind: "damage" | "heal" | "buff"; readonly value: number; readonly buffId?: string } {
    if (value === null || typeof value !== "object") {
        return false;
    }
    const record = value as Record<string, unknown>;
    return (
        (record.kind === "damage" || record.kind === "heal" || record.kind === "buff") &&
        typeof record.value === "number" &&
        Number.isFinite(record.value) &&
        record.value >= 0 &&
        (record.buffId === undefined || (typeof record.buffId === "string" && record.buffId.length > 0))
    );
}

/** 类型守卫：校验配置条目是合法的技能定义（含多效果/目标/条件/动效引用）。 */
function isSkillConfig(value: unknown): value is AutoBattleSkill {
    if (value === null || typeof value !== "object") {
        return false;
    }

    const record = value as Record<string, unknown>;

    const validEffects = record.effects === undefined || (Array.isArray(record.effects) && record.effects.every((effect) => isSkillEffectConfig(effect)));

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
        validEffects &&
        (record.target === undefined || record.target === "enemy-front" || record.target === "ally-lowest-hp" || record.target === "self") &&
        (record.conditionId === undefined || (typeof record.conditionId === "string" && record.conditionId.length > 0)) &&
        (record.effectId === undefined || (typeof record.effectId === "string" && record.effectId.length > 0)) &&
        (record.teleportTo === undefined || (typeof record.teleportTo === "string" && /^\d+:\d+$/.test(record.teleportTo)))
    );
}

/** 类型守卫：校验英雄条目是新表引用格式（baseAttributeId/skillId）。 */
function isHeroTableReference(value: unknown): value is { readonly baseAttributeId: string; readonly skillId: string } {
    if (value === null || typeof value !== "object") {
        return false;
    }
    const record = value as Record<string, unknown>;
    return typeof record.baseAttributeId === "string" && record.baseAttributeId.length > 0 && typeof record.skillId === "string" && record.skillId.length > 0;
}

/** 类型守卫：校验英雄条目是旧内联格式（直接携带属性与技能对象）。 */
function isHeroInlineConfig(value: unknown): value is AutoBattleHeroDefinition {
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
        (record.movePoints === undefined || (typeof record.movePoints === "number" && Number.isFinite(record.movePoints) && record.movePoints >= 0)) &&
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

/** 读取英雄条目并补充缺省 movePoints（默认 1，向后兼容旧配置无该字段）。 */
function readHeroMovePoints(record: { readonly movePoints?: number }): number {
    const move = record.movePoints;
    return move === undefined ? 1 : move;
}

/** 读取基础属性表：校验 id 唯一与数值合法。 */
function readBaseAttributes(table: IConfigTable): readonly AutoBattleBaseAttributes[] {
    const raw = table.read(keyOf("baseAttributes"), configArray, []);
    const entries = raw.map((entry, index) => {
        if (entry === null || typeof entry !== "object") {
            throw new Error(`auto-battle config: baseAttributes entry at index ${index} must be an object`);
        }
        const record = entry as Record<string, unknown>;
        if (
            typeof record.id !== "string" ||
            record.id.length === 0 ||
            typeof record.maxHp !== "number" ||
            !Number.isFinite(record.maxHp) ||
            record.maxHp <= 0 ||
            typeof record.attack !== "number" ||
            !Number.isFinite(record.attack) ||
            record.attack < 0 ||
            typeof record.speed !== "number" ||
            !Number.isFinite(record.speed) ||
            record.speed < 0 ||
            (record.attackRange !== undefined && (typeof record.attackRange !== "number" || !Number.isFinite(record.attackRange) || record.attackRange < 0)) ||
            (record.movePoints !== undefined && (typeof record.movePoints !== "number" || !Number.isFinite(record.movePoints) || record.movePoints < 0))
        ) {
            throw new Error(`auto-battle config: baseAttributes entry at index ${index} has an invalid shape`);
        }
        return {
            id: record.id as string,
            maxHp: record.maxHp as number,
            attack: record.attack as number,
            speed: record.speed as number,
            attackRange: record.attackRange === undefined ? 1 : (record.attackRange as number),
            movePoints: record.movePoints === undefined ? 1 : (record.movePoints as number),
        };
    });
    const seen = new Set<string>();
    for (const entry of entries) {
        if (seen.has(entry.id)) {
            throw new Error(`auto-battle config: duplicate base attribute id "${entry.id}"`);
        }
        seen.add(entry.id);
    }
    return entries;
}

/** 读取技能表：校验条目合法且 id 唯一。 */
function readSkills(table: IConfigTable): readonly AutoBattleSkill[] {
    const raw = table.read(keyOf("skills"), configArray, []);
    const entries = raw.map((entry, index) => {
        if (!isSkillConfig(entry)) {
            throw new Error(`auto-battle config: skills entry at index ${index} has an invalid shape`);
        }
        return entry;
    });
    const seen = new Set<string>();
    for (const entry of entries) {
        if (seen.has(entry.id)) {
            throw new Error(`auto-battle config: duplicate skill id "${entry.id}"`);
        }
        seen.add(entry.id);
    }
    return entries;
}

/** 读取 buff 表：校验 kind/value/duration 合法且 id 唯一。 */
function readBuffs(table: IConfigTable): readonly AutoBattleBuff[] {
    const raw = table.read(keyOf("buffs"), configArray, []);
    const entries = raw.map((entry, index) => {
        if (entry === null || typeof entry !== "object") {
            throw new Error(`auto-battle config: buffs entry at index ${index} must be an object`);
        }
        const record = entry as Record<string, unknown>;
        if (
            typeof record.id !== "string" ||
            record.id.length === 0 ||
            typeof record.name !== "string" ||
            record.name.length === 0 ||
            (record.kind !== "attack-up" && record.kind !== "defense-up" && record.kind !== "damage-over-time" && record.kind !== "heal") ||
            typeof record.value !== "number" ||
            !Number.isFinite(record.value) ||
            record.value < 0 ||
            typeof record.duration !== "number" ||
            !Number.isFinite(record.duration) ||
            record.duration <= 0
        ) {
            throw new Error(`auto-battle config: buffs entry at index ${index} has an invalid shape`);
        }
        return {
            id: record.id as string,
            name: record.name as string,
            kind: record.kind as AutoBattleBuff["kind"],
            value: record.value as number,
            duration: record.duration as number,
        };
    });
    const seen = new Set<string>();
    for (const entry of entries) {
        if (seen.has(entry.id)) {
            throw new Error(`auto-battle config: duplicate buff id "${entry.id}"`);
        }
        seen.add(entry.id);
    }
    return entries;
}

/** 读取单位动画表：校验生成参数合法且 id 唯一。 */
function readUnitAnimations(table: IConfigTable): readonly AutoBattleUnitAnimation[] {
    const raw = table.read(keyOf("unitAnimations"), configArray, []);
    const entries = raw.map((entry, index) => {
        if (entry === null || typeof entry !== "object") {
            throw new Error(`auto-battle config: unitAnimations entry at index ${index} must be an object`);
        }
        const record = entry as Record<string, unknown>;
        const prefixRaw = record.prefixByAnim;
        const countRaw = record.frameCountByAnim;
        const frameMsRaw = record.frameMsByAnim;
        if (
            typeof record.id !== "string" ||
            record.id.length === 0 ||
            typeof record.bundle !== "string" ||
            record.bundle.length === 0 ||
            typeof record.dir !== "string" ||
            record.dir.length === 0 ||
            typeof record.frameCount !== "number" ||
            !Number.isFinite(record.frameCount) ||
            record.frameCount <= 0 ||
            prefixRaw === null ||
            typeof prefixRaw !== "object" ||
            countRaw === null ||
            typeof countRaw !== "object" ||
            frameMsRaw === null ||
            typeof frameMsRaw !== "object"
        ) {
            throw new Error(`auto-battle config: unitAnimations entry at index ${index} has an invalid shape`);
        }
        const prefixes = prefixRaw as Record<string, unknown>;
        const counts = countRaw as Record<string, unknown>;
        const frameTimes = frameMsRaw as Record<string, unknown>;
        for (const anim of AUTO_BATTLE_ANIM_NAMES) {
            if (
                typeof prefixes[anim] !== "string" ||
                (prefixes[anim] as string).length === 0 ||
                typeof counts[anim] !== "number" ||
                !Number.isFinite(counts[anim]) ||
                (counts[anim] as number) <= 0 ||
                typeof frameTimes[anim] !== "number" ||
                !Number.isFinite(frameTimes[anim]) ||
                (frameTimes[anim] as number) <= 0
            ) {
                throw new Error(`auto-battle config: unitAnimations entry at index ${index} has invalid ${anim} animation metadata`);
            }
        }
        const parsedPrefixes = {} as Record<AutoBattleAnimName, string>;
        const parsedCounts = {} as Record<AutoBattleAnimName, number>;
        const parsedFrameTimes = {} as Record<AutoBattleAnimName, number>;
        for (const anim of AUTO_BATTLE_ANIM_NAMES) {
            parsedPrefixes[anim] = prefixes[anim] as string;
            parsedCounts[anim] = counts[anim] as number;
            parsedFrameTimes[anim] = frameTimes[anim] as number;
        }
        return {
            id: record.id as string,
            bundle: record.bundle as string,
            dir: record.dir as string,
            frameCount: record.frameCount as number,
            prefixByAnim: parsedPrefixes,
            frameCountByAnim: parsedCounts,
            frameMsByAnim: parsedFrameTimes,
        };
    });
    const seen = new Set<string>();
    for (const entry of entries) {
        if (seen.has(entry.id)) {
            throw new Error(`auto-battle config: duplicate unit animation id "${entry.id}"`);
        }
        seen.add(entry.id);
    }
    return entries;
}

/** 读取技能动效表：校验 kind 合法且 id 唯一。 */
function readSkillEffects(table: IConfigTable): readonly AutoBattleSkillEffectDef[] {
    const raw = table.read(keyOf("skillEffects"), configArray, []);
    const entries = raw.map((entry, index) => {
        if (entry === null || typeof entry !== "object") {
            throw new Error(`auto-battle config: skillEffects entry at index ${index} must be an object`);
        }
        const record = entry as Record<string, unknown>;
        if (typeof record.id !== "string" || record.id.length === 0 || (record.kind !== "explosion" && record.kind !== "flash" && record.kind !== "float")) {
            throw new Error(`auto-battle config: skillEffects entry at index ${index} has an invalid shape`);
        }
        return { id: record.id as string, kind: record.kind as AutoBattleSkillEffectDef["kind"] };
    });
    const seen = new Set<string>();
    for (const entry of entries) {
        if (seen.has(entry.id)) {
            throw new Error(`auto-battle config: duplicate skill effect id "${entry.id}"`);
        }
        seen.add(entry.id);
    }
    return entries;
}

/** 读取技能条件表：校验 kind/value 合法且 id 唯一。 */
function readSkillConditions(table: IConfigTable): readonly AutoBattleSkillCondition[] {
    const raw = table.read(keyOf("skillConditions"), configArray, []);
    const entries = raw.map((entry, index) => {
        if (entry === null || typeof entry !== "object") {
            throw new Error(`auto-battle config: skillConditions entry at index ${index} must be an object`);
        }
        const record = entry as Record<string, unknown>;
        const validValue = record.value === undefined || (typeof record.value === "number" && Number.isFinite(record.value)) || (typeof record.value === "string" && record.value.length > 0);
        if (typeof record.id !== "string" || record.id.length === 0 || (record.kind !== "self-hp-ratio" && record.kind !== "target-position" && record.kind !== "always") || !validValue) {
            throw new Error(`auto-battle config: skillConditions entry at index ${index} has an invalid shape`);
        }
        return { id: record.id as string, kind: record.kind as AutoBattleSkillCondition["kind"], value: record.value as number | string | undefined };
    });
    const seen = new Set<string>();
    for (const entry of entries) {
        if (seen.has(entry.id)) {
            throw new Error(`auto-battle config: duplicate skill condition id "${entry.id}"`);
        }
        seen.add(entry.id);
    }
    return entries;
}

/** 读取一队单位清单：逐项校验，非法条目抛错并给出序号定位。 */
function readTeam(table: IConfigTable, key: string, side: AutoBattleSide): readonly AutoBattleUnit[] {
    const raw = table.read(keyOf(key), configArray, []);
    if (raw.length === 0) {
        throw new Error(`auto-battle config: team "${key}" must not be empty`);
    }
    // 逻辑槽位 0..N-1：每队至多 MAX_TEAM_SIZE 单位，超规模配置拒绝开战
    if (raw.length > MAX_TEAM_SIZE) {
        throw new Error(`auto-battle config: team "${key}" must have at most ${MAX_TEAM_SIZE} units`);
    }
    return raw.map((entry, index) => {
        if (!isHeroInlineConfig(entry)) {
            throw new Error(`auto-battle config: team "${key}" entry at index ${index} has an invalid shape`);
        }
        return {
            ...entry,
            maxHp: entry.maxHp!,
            attack: entry.attack!,
            speed: entry.speed!,
            attackRange: readHeroAttackRange(entry),
            movePoints: readHeroMovePoints(entry),
            skill: entry.skill!,
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

/** 把英雄原始定义展开为 AutoBattleHero：新表引用格式从基础属性/技能表解析，旧内联格式原样补充。 */
function expandHero(definition: AutoBattleHeroDefinition, baseAttributes: readonly AutoBattleBaseAttributes[], skills: readonly AutoBattleSkill[]): AutoBattleHero {
    if (isHeroTableReference(definition)) {
        const attrs = baseAttributes.find((entry) => entry.id === definition.baseAttributeId);
        if (attrs === undefined) {
            throw new Error(`auto-battle config: hero "${definition.id}" references unknown base attribute "${definition.baseAttributeId}"`);
        }
        const skill = skills.find((entry) => entry.id === definition.skillId);
        if (skill === undefined) {
            throw new Error(`auto-battle config: hero "${definition.id}" references unknown skill "${definition.skillId}"`);
        }
        return {
            id: definition.id,
            name: definition.name,
            position: definition.position,
            maxHp: attrs.maxHp,
            attack: attrs.attack,
            speed: attrs.speed,
            attackRange: readHeroAttackRange({ attackRange: attrs.attackRange }),
            movePoints: readHeroMovePoints({ movePoints: attrs.movePoints }),
            energyMax: definition.energyMax,
            skill,
            animationId: definition.animationId,
        };
    }
    // 旧内联格式：技能/属性随条目携带
    return {
        id: definition.id,
        name: definition.name,
        position: definition.position,
        maxHp: definition.maxHp ?? 1,
        attack: definition.attack ?? 0,
        speed: definition.speed ?? 0,
        attackRange: readHeroAttackRange(definition),
        movePoints: readHeroMovePoints(definition),
        energyMax: definition.energyMax,
        skill: definition.skill!,
        animationId: definition.animationId,
    };
}

/** 读取英雄池：逐项校验合法（新表引用或旧内联），池内 id 唯一，返回展开后的英雄与原始定义。 */
function readHeroes(
    table: IConfigTable,
    baseAttributes: readonly AutoBattleBaseAttributes[],
    skills: readonly AutoBattleSkill[],
): { readonly heroes: readonly AutoBattleHero[]; readonly definitions: readonly AutoBattleHeroDefinition[] } {
    const raw = table.read(keyOf("heroes"), configArray, []);
    const definitions = raw.map((entry, index) => {
        if (isHeroTableReference(entry)) {
            const record = entry as Record<string, unknown>;
            if (
                typeof record.id !== "string" ||
                record.id.length === 0 ||
                typeof record.name !== "string" ||
                record.name.length === 0 ||
                (record.position !== "front" && record.position !== "mid" && record.position !== "back") ||
                typeof record.energyMax !== "number" ||
                !Number.isFinite(record.energyMax) ||
                record.energyMax <= 0
            ) {
                throw new Error(`auto-battle config: heroes entry at index ${index} has an invalid shape`);
            }
            return {
                id: record.id as string,
                name: record.name as string,
                position: record.position as "front" | "mid" | "back",
                energyMax: record.energyMax as number,
                baseAttributeId: (record.baseAttributeId as string) ?? "",
                skillId: (record.skillId as string) ?? "",
                animationId: typeof record.animationId === "string" && record.animationId.length > 0 ? (record.animationId as string) : undefined,
            };
        }
        if (!isHeroInlineConfig(entry)) {
            throw new Error(`auto-battle config: heroes entry at index ${index} has an invalid shape`);
        }
        return entry;
    });
    const heroes = definitions.map((definition) => expandHero(definition, baseAttributes, skills));
    assertUniqueHeroIds(heroes);
    return { heroes, definitions };
}

/**
 * 读取一队初始编队（heroId 序列）：校验引用存在且未超上阵上限，展开为
 * 战斗单位（附加 side 与队内逻辑槽位 index）。返回展开后的单位与原始 id 序列，
 * 供开战实例化与编队持久化复用。
 */
function readLineup(
    table: IConfigTable,
    key: string,
    side: AutoBattleSide,
    heroById: ReadonlyMap<string, AutoBattleHero>,
): { readonly units: readonly AutoBattleUnit[]; readonly ids: readonly string[] } {
    const raw = table.read(keyOf(key), configArray, []);
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

function readEnergyGain(table: IConfigTable, key: string, fallback: number): number {
    const value = table.read(keyOf(key), configNumber, fallback);
    if (value < 0) {
        throw new Error(`auto-battle config: ${key} must not be negative`);
    }
    return value;
}

/** 读取移动能量消耗比例：0..1 闭区间（缺省 0.5，"移动消耗近乎一半"）。 */
function readEnergyRatio(table: IConfigTable): number {
    const value = table.read(keyOf("energyMoveCostRatio"), configNumber, 0.5);
    if (value < 0 || value > 1) {
        throw new Error("auto-battle config: energyMoveCostRatio must be within [0, 1]");
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
 *
 * 7 张表（baseAttributes/heroes/unitAnimations/skills/buffs/skillEffects/
 * skillConditions）为可选键：提供时 heroes 可走表引用格式（baseAttributeId/
 * skillId/animationId），缺失时回退旧内联格式（heroes 直接携带属性与技能对象），
 * 保证既有配置与测试无需改造即可开战。
 */
export function createAutoBattleConfig(content: Record<string, unknown>): AutoBattleConfigHandle {
    const table: IConfigTable = createConfigTable(content);

    const energyGainAttacker = readEnergyGain(table, "energyGainAttacker", 10);
    const energyGainTarget = readEnergyGain(table, "energyGainTarget", 5);
    const energyMoveCostRatio = readEnergyRatio(table);
    const energyGainOnKill = readEnergyGain(table, "energyGainOnKill", 10);

    // 7 张表：可选键，缺省为空数组（旧格式配置不提供）
    const baseAttributes = readBaseAttributes(table);
    const skills = readSkills(table);
    const buffs = readBuffs(table);
    const unitAnimations = readUnitAnimations(table);
    const skillEffects = readSkillEffects(table);
    const skillConditions = readSkillConditions(table);

    // 新格式：heroes 池 + lineups
    if (Object.prototype.hasOwnProperty.call(content, "heroes")) {
        const { heroes, definitions } = readHeroes(table, baseAttributes, skills);
        const heroById = new Map(heroes.map((hero) => [hero.id, hero]));
        const lineupsTable: IConfigTable = createConfigTable(table.read(keyOf("lineups"), configObject, {}));
        const ally = readLineup(lineupsTable, "ally", "ally", heroById);
        const enemy = readLineup(lineupsTable, "enemy", "enemy", heroById);
        return {
            ally: ally.units,
            enemy: enemy.units,
            heroes,
            lineups: { ally: ally.ids, enemy: enemy.ids },
            energyGainAttacker,
            energyGainTarget,
            energyMoveCostRatio,
            energyGainOnKill,
            baseAttributes,
            heroDefinitions: definitions,
            unitAnimations,
            skills,
            buffs,
            skillEffects,
            skillConditions,
        };
    }

    // 兼容格式（deprecated）：teams 直接提供双方单位清单
    const teams = table.read(keyOf("teams"), configObject, {});
    const teamTable: IConfigTable = createConfigTable(teams);
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
        movePoints: unit.movePoints,
        energyMax: unit.energyMax,
        skill: unit.skill,
        animationId: unit.animationId,
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
        energyMoveCostRatio,
        energyGainOnKill,
        baseAttributes,
        heroDefinitions: heroes,
        unitAnimations,
        skills,
        buffs,
        skillEffects,
        skillConditions,
    };
}

/**
 * 配置模块：组合根创建配置句柄并注入；模块只登记引用，配置表为不可变数据，
 * 生命周期无副作用，不在此释放共享配置。
 */
export function createAutoBattleConfigModule(config: AutoBattleConfigHandle): IModule {
    return {
        id: "auto_battle.config",
        dependencies: [],
        start: () => {
            // 配置句柄在组合根构造时即就绪；start 只是让模块进入装配清单
            void config.ally.length;
        },
    };
}
