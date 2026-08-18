export enum BattleEventType {
    BattleStarted = "BattleStarted",

    AttackStarted = "AttackStarted",

    SkillStarted = "SkillStarted",
    SkillFinished = "SkillFinished",

    Damage = "Damage",
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

export interface DamageEvent extends BattleEvent {
    type: BattleEventType.Damage;

    attackerId: string;
    targetId: string;

    rawDamage: number;
    finalDamage: number;

    targetHpBefore: number;
    targetHpAfter: number;
}

export interface UnitDiedEvent extends BattleEvent {
    type: BattleEventType.UnitDied;

    unitId: string;
}
