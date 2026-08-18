import { EffectContext } from "../effect/EffectContext";

export enum BattleEventType {
    BattleStarted = "BattleStarted",

    DecisionMade = "DecisionMade",

    AttackStarted = "AttackStarted",

    SkillStarted = "SkillStarted",
    SkillFinished = "SkillFinished",

    BuffAdded = "BuffAdded",
    BuffRemoved = "BuffRemoved",
    BuffStackChanged = "BuffStackChanged",

    Damage = "Damage",
    Heal = "Heal",
    EnergyChanged = "EnergyChanged",

    UnitDied = "UnitDied",

    BattleEnded = "BattleEnded",
}

export interface BattleEvent {
    type: BattleEventType;
    time: number;
}

export interface BattleStartedEvent extends BattleEvent {
    type: BattleEventType.BattleStarted;
}

export interface DecisionMadeEvent extends BattleEvent {
    type: BattleEventType.DecisionMade;

    unitId: string;

    skillId: string;

    targetIds: string[];
}

export interface AttackStartedEvent extends BattleEvent {
    type: BattleEventType.AttackStarted;

    attackerId: string;
    targetId: string;
}

export interface SkillStartedEvent extends BattleEvent {
    type: BattleEventType.SkillStarted;

    casterId: string;
    skillId: string;
}

export interface SkillFinishedEvent extends BattleEvent {
    type: BattleEventType.SkillFinished;

    casterId: string;
    skillId: string;
}

export interface BuffAddedEvent extends BattleEvent {
    type: BattleEventType.BuffAdded;

    sourceId?: string;
    targetId: string;
    buffId: string;
    stacks: number;
    duration: number;
}

export interface BuffStackChangedEvent extends BattleEvent {
    type: BattleEventType.BuffStackChanged;

    targetId: string;
    buffId: string;
    stacks?: number;
    duration?: number;

    sourceId: string;

    context?: EffectContext;
}

export interface BuffRemovedEvent extends BattleEvent {
    type: BattleEventType.BuffRemoved;

    targetId: string;
    buffId: string;
}

export interface DamageEvent extends BattleEvent {
    type: BattleEventType.Damage;

    sourceId: string;
    targetId: string;

    rawDamage: number;
    finalDamage: number;
    actualDamage: number;

    targetHpBefore: number;
    targetHpAfter: number;

    killed: boolean;

    context?: EffectContext;
}

export interface HealEvent extends BattleEvent {
    type: BattleEventType.Heal;

    casterId: string;
    targetId: string;

    rawHeal: number;
    actualHeal: number;

    targetHpBefore: number;
    targetHpAfter: number;

    context?: EffectContext;
}

export interface EnergyChangedEvent extends BattleEvent {
    type: BattleEventType.EnergyChanged;

    unitId: string;
    delta: number;
    energy: number;
}

export interface UnitDiedEvent extends BattleEvent {
    type: BattleEventType.UnitDied;

    unitId: string;

    killerId: string;
}
