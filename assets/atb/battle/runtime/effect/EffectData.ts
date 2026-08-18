export enum EffectType {
    Damage = "Damage",
    Heal = "Heal",
    AddBuff = "AddBuff",
}

export interface DamageEffectData {
    type: EffectType.Damage;
    value: number;
}

export interface HealEffectData {
    type: EffectType.Heal;
    value: number;
}

export interface AddBuffEffectData {
    type: EffectType.AddBuff;
    buffId: string;
}

export type EffectData = DamageEffectData | HealEffectData | AddBuffEffectData;
