export enum EffectResultType {
    Damage = "Damage",
    Heal = "Heal",
    BuffAdded = "BuffAdded",
    BuffRemoved = "BuffRemoved",
    Miss = "Miss",
    Immune = "Immune",
}

export interface EffectResult {
    type: EffectResultType;
    success: boolean;
    sourceId: string;
    targetId: string;
    value?: number;
    actualValue?: number;
}
