/**
 * auto-battle 内容域 8 张配置表的 schema 定义。
 * 表名与跨表引用约定：
 *   heroes.baseAttributeId → base-attributes.id
 *   heroes.skillId → skills.id
 *   heroes.animationId → unit-animations.id
 *   skills.effectId → skill-effects.id
 * 用户可见字段（name）一律为 i18n-key 类型（迁移后值为 `auto_battle.<table>.<id>.name`）。
 */
import type { TableSchema } from "./types";

const AUTO_BATTLE_DIR = "assets/game-content/auto-battle";

export const AUTO_BATTLE_SCHEMAS: readonly TableSchema[] = [
    {
        table: "base-attributes",
        file: `${AUTO_BATTLE_DIR}/base-attributes.json`,
        shape: "array",
        fields: [
            { key: "id", type: "id", idKey: true },
            { key: "maxHp", type: "number", min: 1, max: 10000 },
            { key: "attack", type: "number", min: 0, max: 10000 },
            { key: "speed", type: "number", min: 0, max: 10000 },
            { key: "attackRange", type: "number", min: 0, max: 100 },
            { key: "movePoints", type: "number", min: 0, max: 100 },
        ],
    },
    {
        table: "battle-setup",
        file: `${AUTO_BATTLE_DIR}/battle-setup.json`,
        shape: "object",
        fields: [
            { key: "lineups", type: "object", required: true },
            { key: "energyGainAttacker", type: "number", min: 0, max: 1000 },
            { key: "energyGainTarget", type: "number", min: 0, max: 1000 },
            { key: "energyMoveCostRatio", type: "number", min: 0, max: 10 },
            { key: "energyGainOnKill", type: "number", min: 0, max: 1000 },
        ],
    },
    {
        table: "buffs",
        file: `${AUTO_BATTLE_DIR}/buffs.json`,
        shape: "array",
        fields: [
            { key: "id", type: "id", idKey: true },
            { key: "name", type: "i18n-key", displayText: true },
            { key: "kind", type: "enum", enum: ["attack-up", "defense-up", "damage-over-time"] },
            { key: "value", type: "number", min: 0, max: 10000 },
            { key: "duration", type: "number", min: 0, max: 1000 },
        ],
    },
    {
        table: "heroes",
        file: `${AUTO_BATTLE_DIR}/heroes.json`,
        shape: "array",
        fields: [
            { key: "id", type: "id", idKey: true },
            { key: "name", type: "i18n-key", displayText: true },
            { key: "position", type: "enum", enum: ["front", "mid", "back"] },
            { key: "baseAttributeId", type: "id", refTable: "base-attributes" },
            { key: "energyMax", type: "number", min: 1, max: 10000 },
            { key: "skillId", type: "id", refTable: "skills" },
            { key: "animationId", type: "id", refTable: "unit-animations" },
        ],
    },
    {
        table: "skill-conditions",
        file: `${AUTO_BATTLE_DIR}/skill-conditions.json`,
        shape: "array",
        fields: [
            { key: "id", type: "id", idKey: true },
            { key: "kind", type: "enum", enum: ["self-hp-ratio"] },
            { key: "value", type: "number", min: 0, max: 10 },
        ],
    },
    {
        table: "skill-effects",
        file: `${AUTO_BATTLE_DIR}/skill-effects.json`,
        shape: "array",
        fields: [
            { key: "id", type: "id", idKey: true },
            { key: "kind", type: "enum", enum: ["explosion", "flash", "float", "physical-impact", "fireball", "heal-aura"] },
        ],
    },
    {
        table: "skills",
        file: `${AUTO_BATTLE_DIR}/skills.json`,
        shape: "array",
        fields: [
            { key: "id", type: "id", idKey: true },
            { key: "name", type: "i18n-key", displayText: true },
            { key: "kind", type: "enum", enum: ["damage", "heal"] },
            { key: "value", type: "number", min: 0, max: 10000 },
            { key: "energyCost", type: "number", min: 0, max: 1000 },
            { key: "target", type: "enum", enum: ["enemy-front", "ally-lowest-hp"] },
            { key: "effects", type: "array", itemType: "object", required: false },
            { key: "effectId", type: "id", refTable: "skill-effects", required: false },
        ],
    },
    {
        table: "unit-animations",
        file: `${AUTO_BATTLE_DIR}/unit-animations.json`,
        shape: "array",
        assets: { bundleDir: "animations", dirField: "dir", prefixField: "prefixByAnim", countField: "frameCount", countByAnimField: "frameCountByAnim" },
        fields: [
            { key: "id", type: "id", idKey: true },
            { key: "bundle", type: "enum", enum: ["animations"] },
            { key: "dir", type: "string" },
            { key: "frameCount", type: "number", min: 1, max: 10000 },
            { key: "frameCountByAnim", type: "object" },
            { key: "frameMsByAnim", type: "object" },
            { key: "prefixByAnim", type: "object" },
        ],
    },
];

/** 全部已注册表（后续内容域扩展时在此追加 schema）。 */
export const ALL_SCHEMAS: readonly TableSchema[] = [...AUTO_BATTLE_SCHEMAS];
