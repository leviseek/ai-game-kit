export enum EffectType {
    Damage = "Damage",
}

export interface EffectData {
    type: EffectType;
    value: number;
}
