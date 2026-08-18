import { ModifierType } from "../../runtime/buff/BuffModifier";
import { EffectType } from "../../runtime/effect/EffectData";
import { StatType } from "../../runtime/stat/StatType";
import { TargetRelation, TargetType } from "../../runtime/target/TargetQuery";
import { BuffData } from "../buffs/BuffData";
import { SkillData } from "../skills/SkillData";
import { UnitData } from "../units/UnitData";
import { BattleDefinition } from "./BattleDefinition";

export const TestBuffs = {
    burning: {
        id: "burning",

        name: "Burning",

        duration: 5,

        maxStacks: 3,

        periodic: {
            interval: 1,

            effects: [
                {
                    type: EffectType.Damage,

                    value: 10,
                },
            ],
        },
    } satisfies BuffData,

    rage: {
        id: "rage",

        name: "Rage",

        duration: 5,

        maxStacks: 1,

        modifiers: [
            {
                stat: StatType.Attack,

                type: ModifierType.Percent,

                value: 0.2,
            },
        ],
    } satisfies BuffData,
};

export const TestSkills = {
    meteor: {
        id: "meteor",

        name: "Meteor",

        cost: 20,

        cooldown: 5,

        target: {
            relation: TargetRelation.Enemy,

            type: TargetType.All,
        },

        effects: [
            {
                type: EffectType.Damage,

                value: 50,
            },

            {
                type: EffectType.AddBuff,

                buffId: "burning",
            },
        ],
    } satisfies SkillData,

    rage: {
        id: "rage_skill",

        name: "Rage",

        cost: 30,

        cooldown: 8,

        target: {
            relation: TargetRelation.Self,

            type: TargetType.Single,
        },

        effects: [
            {
                type: EffectType.AddBuff,

                buffId: "rage",
            },
        ],
    } satisfies SkillData,
};

export const TestUnits = {
    knight: {
        id: "hero_knight",

        name: "Knight",

        team: 1,

        maxHp: 120,

        attack: 100,

        defense: 30,

        maxEnergy: 100,

        initialEnergy: 60,

        energyRegen: 10,

        skills: ["rage_skill", "meteor"],

        autoBattle: true,
    } satisfies UnitData,

    enemy: {
        id: "enemy_001",

        name: "Enemy",

        team: 2,

        maxHp: 100,

        attack: 70,

        defense: 20,

        maxEnergy: 100,

        initialEnergy: 100,

        energyRegen: 10,

        skills: ["meteor"],

        autoBattle: true,
    } satisfies UnitData,
};

export const TestBattle: BattleDefinition = {
    redTeam: ["hero_knight"],

    blueTeam: ["enemy_001"],
};
